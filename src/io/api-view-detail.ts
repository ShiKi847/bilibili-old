import { objUrl } from "../utils/format/url";
import { IAidDatail, jsonCheck } from "./api";
import { URLS } from "./urls";

export class ApiViewDetail {
    code = 0;
    data: IApiViewDetailResponse = <any>{
        Card: { archive_count: -1, article_count: -1, card: {}, follower: -1, following: false, like_num: -1, space: {} },
        Related: <any[]>[],
        Reply: { page: {}, replies: [] },
        Spec: null,
        Tags: <any[]>[],
        View: <Record<string, any>>{},
        elec: null,
        hot_share: {},
        recommend: null,
        view_addit: {}
    }
    message = "0";
    ttl = 1;
}
export async function apiViewDetail(aid: number) {
    let viewData: any;
    try {
        const viewRes = await fetch(objUrl(URLS.X_VIEW, { aid }), { credentials: 'include' });
        if (viewRes.ok) {
            const viewJson = await viewRes.json();
            if (viewJson && viewJson.code === 0 && viewJson.data) {
                viewData = viewJson.data;
            }
        }
    } catch { }

    if (!viewData) {
        try {
            const viewRes = await fetch(objUrl(URLS.X_VIEW, { aid }));
            if (viewRes.ok) {
                const viewJson = await viewRes.json();
                if (viewJson && viewJson.code === 0 && viewJson.data) {
                    viewData = viewJson.data;
                }
            }
        } catch { }
    }

    if (!viewData) {
        throw new Error(`Failed to fetch view data for av${aid}`);
    }

    const detail = new ApiViewDetail();
    detail.data.View = viewData;
    if (viewData?.owner) {
        detail.data.Card = <any>{
            card: {
                mid: viewData.owner.mid,
                name: viewData.owner.name,
                face: viewData.owner.face,
                vip: { vipStatus: 0, vipType: 0 },
                official_verify: { type: -1, desc: '' },
                pendant: { image: '' },
                nameplate: { image: '' },
                level_info: { current_level: 0 },
                fans: 0,
                archiveCount: 0,
                sign: ''
            },
            archive_count: 0
        };
    }
    try {
        const mid = viewData?.owner?.mid;
        const [tagsRes, relatedRes, cardRes] = await Promise.allSettled([
            fetch(objUrl(URLS.TAG_ARCHIVE, { aid }), { credentials: 'include' }).then(r => r.json()),
            fetch(objUrl(URLS.ARCHIVE_RELATED, { aid }), { credentials: 'include' }).then(r => r.json()),
            mid ? fetch(`https://api.bilibili.com/x/web-interface/card?mid=${mid}`, { credentials: 'include' }).then(r => r.json()) : Promise.resolve(null)
        ]);
        if (tagsRes.status === 'fulfilled' && tagsRes.value?.data) {
            detail.data.Tags = tagsRes.value.data;
        }
        if (relatedRes.status === 'fulfilled' && relatedRes.value?.data) {
            detail.data.Related = relatedRes.value.data;
        }
        if (cardRes.status === 'fulfilled' && cardRes.value?.data?.card) {
            const c = cardRes.value.data.card;
            c.vip = c.vip || { vipStatus: 0, vipType: 0 };
            c.official_verify = c.official_verify || { type: -1, desc: '' };
            c.pendant = c.pendant || { image: '' };
            c.nameplate = c.nameplate || { image: '' };
            c.level_info = c.level_info || { current_level: 0 };
            detail.data.Card = {
                card: c,
                archive_count: cardRes.value.data.archive_count || 0
            };
        }
    } catch { }
    return detail.data;
}

interface IOfficial {
    role: number;
    title: string;
    desc: string;
    type: number;
}
interface ILevelInfo {
    current_level: number;
    current_min: number;
    current_exp: number;
    next_exp: number;
}
interface INameplate {
    condition: string;
    image: string;
    image_small: string;
    level: string;
    name: string;
    nid: number;
}

export interface IPendant {
    expire: number;
    image: string;
    image_enhance: string;
    image_enhance_frame: string;
    name: string;
    pid: number;
}
interface IVip {
    avatar_subscript: number;
    avatar_subscript_url: string;
    due_date: number;
    label: {
        bg_color: string;
        bg_style: number;
        border_color: string;
        img_label_uri_hans: string;
        img_label_uri_hans_static: string;
        img_label_uri_hant: string;
        img_label_uri_hant_static: string;
        label_theme: string;
        path: string;
        text: string;
        text_color: string;
        use_img_label: boolean;
    }
    nickname_color: string;
    role: number;
    status: number;
    theme_type: number;
    tv_vip_pay_type: number;
    tv_vip_status: number;
    type: number;
    vipStatus: number;
    vipType: number;
    vip_pay_type: number;
}
export interface IUserInfo {
    DisplayRank: string;
    Official: IOfficial;
    approve: boolean;
    article: number;
    attention: number;
    attentions: string[];
    birthday: string;
    description: string;
    face: string;
    face_nft: number;
    face_nft_type: number;
    fans: number;
    friend: number;
    is_senior_member: number;
    level_info: ILevelInfo;
    mid: number;
    name: string;
    nameplate: INameplate;
    official_verify: { type: number; desc: string; }
    pendant: IPendant;
    place: string;
    rank: string;
    regtime: number;
    sex: string;
    sign: string;
    spacesta: number;
    vip: IVip;
}
interface IUserCard {
    archive_count: number;
    article_count: number;
    card: IUserInfo;
    follower: number;
    following: boolean;
    like_num: number;
    space: { s_img: string; l_img: string }
}

interface IReply {
    action: number;
    assist: number;
    attr: number;
    content: { message: string; plat: number; device: string; }
    count: number;
    ctime: number;
    dialog: number;
    fansgrade: number;
    floor: number;
    like: number;
    mid: number;
    oid: number;
    parent: number;
    rcount: number;
    replies: IReply[];
    root: number;
    rpid: number;
    show_follow: boolean;
    state: number;
    type: number;
}
export interface IApiViewDetailResponse {
    Card: IUserCard;
    Related: IAidDatail[];
    Reply: {
        page: { acount: number; count: number; num: number; size: number; };
        replies: IReply[];
    };
    Spec: unknown;
    Tags: unknown[];
    View: IAidDatail;
    elec: unknown;
    guide: unknown;
    hot_share: { show: boolean; list: unknown[] };
    recommend: unknown;
    view_addit: boolean[];
}
