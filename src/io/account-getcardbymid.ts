import { uid } from "../utils/conf/uid";
import { getCookies } from "../utils/cookie";
import { debug } from "../utils/debug";
import { timeFormat } from "../utils/format/time";
import { objUrl } from "../utils/format/url";
import { jsonCheck } from "./api";
import { URLS } from "./urls";

export interface IJointimeInfo {
    text: string;
    isEstimated: boolean;
    hint?: string;
}

/** B站历史单调递增 UID 时序锚点表（[UID, Unix秒级时间戳]） */
const UID_ANCHORS: [number, number][] = [
    [1, 1245945600],          // 2009-06-26 (B站建站)
    [78766, 1293811200],      // 2011-01-01
    [259333, 1325347200],     // 2012-01-01
    [510000, 1342281600],     // 2012-07-15 (UID 510027 对应 2012-07)
    [1123000, 1356969600],    // 2013-01-01
    [2954624, 1388505600],    // 2014-01-01
    [7000000, 1420041600],    // 2015-01-01
    [25600000, 1451577600],   // 2016-01-01
    [70000000, 1483200000],   // 2017-01-01
    [138000000, 1498838400],  // 2017-07-01
    [250000000, 1514736000],  // 2018-01-01
    [390000000, 1546272000],  // 2019-01-01
    [500000000, 1577808000],  // 2020-01-01
    [600000000, 1590940800],  // 2020-06-01
    [700000000, 1602691200],  // 2020-10-15 (散列大号改版临界点)
];

/**
 * 针对2020年10月前单调自增的老号进行分段线性插值推算注册年月
 * @param mid 用户UID
 */
export function estimateJointimeByMid(mid: number): IJointimeInfo | null {
    const targetMid = Math.floor(mid);
    if (!targetMid || targetMid <= 0 || targetMid >= 700000000 || isNaN(targetMid)) {
        return null;
    }
    for (let i = 0; i < UID_ANCHORS.length - 1; i++) {
        const [u0, t0] = UID_ANCHORS[i];
        const [u1, t1] = UID_ANCHORS[i + 1];
        if (targetMid >= u0 && targetMid <= u1) {
            const ratio = (targetMid - u0) / (u1 - u0);
            const estTs = Math.round(t0 + ratio * (t1 - t0));
            // 采用北京时间（UTC+8）计算推算的年月
            const cst = new Date((estTs + 8 * 3600) * 1000);
            const y = cst.getUTCFullYear();
            const m = String(cst.getUTCMonth() + 1).padStart(2, '0');
            return {
                text: `约 ${y}-${m} (估算)`,
                isEstimated: true,
                hint: 'B站已隐藏他人精确注册时间，此为根据UID推算的大致注册年月',
            };
        }
    }
    return null;
}

const jointimeCache = new Map<number, Promise<IJointimeInfo | null>>();

/**
 * 方式B：获取个人空间注册时间
 * 1. 本人空间（且已登录）：通过创作中心日历接口获取官方精确时间戳并格式化到秒
 * 2. 他人空间或本人接口异常：针对 7 亿以前顺序自增老号通过历史时序锚点表分段线性插值估算
 * @param mid 用户UID
 */
export function getSpaceJointime(mid: number): Promise<IJointimeInfo | null> {
    const targetMid = Math.floor(mid);
    if (!targetMid || targetMid <= 0 || isNaN(targetMid)) {
        return Promise.resolve(null);
    }
    if (jointimeCache.has(targetMid)) {
        return jointimeCache.get(targetMid)!;
    }
    const promise = (async (): Promise<IJointimeInfo | null> => {
        const currentUid = uid || Number(getCookies().DedeUserID);
        const isOwnSpace = Boolean(currentUid && currentUid > 0 && targetMid === currentUid);

        if (isOwnSpace) {
            try {
                let response: Response;
                try {
                    response = await fetch(URLS.MEMBER_CALENDAR_EVENT, { credentials: "include" });
                    if (!response.ok) {
                        throw new Error(`fetch status ${response.status}`);
                    }
                } catch {
                    response = await GM.fetch(URLS.MEMBER_CALENDAR_EVENT, { credentials: "include" });
                }
                if (response.ok) {
                    const json = await response.json();
                    if (json && json.code === 0) {
                        const jointime = Number(json?.data?.jointime ?? json?.data?.pfs?.jointime);
                        if (jointime && jointime > 0) {
                            return {
                                text: timeFormat(jointime * 1000, true),
                                isEstimated: false,
                            };
                        }
                    }
                }
            } catch (e) {
                debug.warn("获取本人注册时间失败，降级至UID推算", e);
            }
        }

        return estimateJointimeByMid(targetMid);
    })();
    jointimeCache.set(targetMid, promise);
    return promise;
}

export async function accountGetCardByMid(mid: number) {
    try {
        const response = await GM.fetch(objUrl(URLS.CARD, { mid }));
        const json = await response.json();
        const data = jsonCheck(json);
        return <IAccountCard>(data.card || data.data?.card || data.data);
    } catch {
        const response = await GM.fetch(objUrl(URLS.ACCOUNT_GETCARDBYMID, { mid }));
        const json = await response.json();
        const data = jsonCheck(json);
        return <IAccountCard>(data.card || data.data?.card || data.data);
    }
}

export interface IAccountCard {
    DisplayRank: string;
    approve: boolean;
    article: number;
    attention: number;
    attentions: number[];
    birthday: string;
    coins: number;
    description: string;
    face: string;
    fans: number;
    friend: number;
    level_info: { next_exp: number; current_level: number; current_min: number; current_exp: number; };
    mid: number;
    name: string;
    nameplate: { condition: string; image: string; image_small: string; level: string; name: string; nid: number };
    official_verify: { type: number; desc: string; };
    pendant: { pid: number; name: string; image: string; expire: number; };
    place: string;
    rank: string;
    regtime: number;
    sex: string;
    sign: string;
    spacesta: number;
}