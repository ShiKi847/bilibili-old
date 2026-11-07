import { BLOD } from "../core/bilibili-old";
import { observerAddedNodes } from "../core/observer";
import { toast } from "../core/toast";
import { urlCleaner } from '../core/url';
import { user } from "../core/user";
import { getSpaceJointime } from "../io/account-getcardbymid";
import { jsonCheck } from "../io/api";
import json from '../json/mid.json';
import { uid } from "../utils/conf/uid";
import { getCookies } from "../utils/cookie";
import { debug } from "../utils/debug";
import { addCss } from "../utils/element";
import { FetchHook } from "../utils/hook/fetch";
import { xhrHook } from "../utils/hook/xhr";
import { poll } from "../utils/poll";
import spaceHtml from '../html/space.html';
import { Header } from "./header";
import { Page } from "./page";

const Mid = {
    11783021: '哔哩哔哩番剧出差',
    1988098633: 'b站_戲劇咖',
    2042149112: 'b站_綜藝咖'
}
export class PageSpace extends Page {

    protected mid: number;

    /** 失效视频aid */
    protected aids: number[] = [];

    protected aidInfo: Record<'cover' | 'title', string>[] = [];

    /** 解析当前页面 mid */
    protected resolveMid(): number {
        const rawMid = location.pathname.match(/^\/(\d+)/)?.[1] || BLOD.path[3]?.split(/[?#]/)[0];
        const pathMid = Number(rawMid);
        if (pathMid && pathMid > 0) {
            return pathMid;
        }
        if (location.pathname === '/' || location.pathname === '') {
            return uid || Number(getCookies().DedeUserID) || 0;
        }
        return 0;
    }

    constructor() {
        super(spaceHtml);
        this.mid = this.resolveMid();
        // 修复限制访问up空间（网络层修复，重写前后均生效）
        this.midInfo();
        user.addCallback(status => {
            if (status.space) {
                // 重写为旧版个人空间页
                this.rewrite(status.header);
            } else {
                // 在新版页面基础上应用各项修复
                status.album && this.album();
                status.lostVideo && this.lostVideo();
            }
            status.jointime && this.jointime();
        });
    }

    /** 重写为旧版个人空间页 */
    protected rewrite(hasHeader?: boolean) {
        urlCleaner.updateLocation(location.href);
        this.updateDom();
        if (hasHeader) {
            Header.remount();
        }
    }

    /** 修复限制访问up空间 */
    protected midInfo() {
        switch (this.mid) {
            case 11783021:
            case 1988098633:
            case 2042149112:
                json.data.mid = this.mid;
                json.data.name = json.data.official.desc = (Mid[this.mid] || Mid[11783021]) + ' 官方帐号';
                xhrHook("acc/info?", undefined, obj => {
                    if (obj.responseText && obj.responseText.includes("-404")) {
                        obj.response = obj.responseText = JSON.stringify(json);
                        toast.warning("该用户被404，已使用缓存数据恢复访问！");
                    } else if (obj.responseType === 'blob' && obj.response.size === 46) {
                        obj.response = new Blob([JSON.stringify(json)], { type: 'application/json' });
                        toast.warning("该用户被404，已使用缓存数据恢复访问！");
                    }
                }, false);
                // #494 空间ajax似乎已改用fetch
                new FetchHook('acc/info?').response(async res => {
                    const text = await res.text();
                    if (text.includes('-404')) {
                        return JSON.stringify(json)
                    }
                })
                break;
            default:
                break;
        }
    }

    /** 还原相簿 */
    protected album() {
        xhrHook("api.bilibili.com/x/dynamic/feed/draw/doc_list", undefined, obj => {
            const response = JSON.parse(<string>obj.responseText);
            let data = response.data.items.reduce((s: number[], d: Record<string, any>) => {
                s.push(d.doc_id);
                return s;
            }, []);
            setTimeout(() => {
                document.querySelectorAll(".album-card").forEach((d, i) => {
                    (<HTMLAnchorElement>d.firstChild).href = `//h.bilibili.com/${data[i]}`;
                    (<HTMLAnchorElement>d.children[1]).href = `//h.bilibili.com/${data[i]}`;
                })
            }, 1000)
        }, false);
    }

    /** 动态重定向回相簿 */
    static album() {
        xhrHook(['x/polymer/web-dynamic', 'detail?'], undefined, res => {
            const result = res.responseType === "json" ? res.response : JSON.parse(res.response);
            if (result.code === 0) {
                if (result.data?.item.type === 'DYNAMIC_TYPE_DRAW') location.replace(`https://h.bilibili.com/${result.data.item.basic.rid_str}`)
            }
        }, false);
    }

    protected jointimeInited = false;

    /** 注册时间 */
    protected jointime() {
        if (this.jointimeInited) return;
        this.jointimeInited = true;

        if (!this.mid) {
            this.mid = this.resolveMid();
        }

        // 注入旧版个人空间卡片样式
        document.getElementById('jointime-old-style') || addCss(`
            .user .info .meta .row {
                height: auto !important;
                white-space: normal;
            }
            .user .info .jointime .icon {
                background-position: -209px -84px;
            }
            .user .info .jointime .text {
                color: #00a1d6;
            }
        `, 'jointime-old-style');

        const tryMount = () => {
            // 1. 兼容旧版个人空间（右侧资料卡片）
            const uidItem = document.querySelector('.user .info .meta .row .item.uid');
            const row = uidItem?.closest<HTMLElement>('.row') || document.querySelector<HTMLElement>('.user .info .meta .row');

            if (row && (uidItem || row.querySelector('.item.uid'))) {
                const targetUidItem = uidItem || row.querySelector('.item.uid');
                const domMidStr = targetUidItem?.textContent?.replace(/\D+/g, '');
                const domMid = domMidStr ? Number(domMidStr) : 0;
                if (domMid > 0 && domMid !== this.mid) {
                    this.mid = domMid;
                }
                const targetMid = domMid > 0 ? domMid : this.mid;
                if (!targetMid) return;

                const existingItem = row.querySelector<HTMLElement>('.item.jointime');
                if (existingItem && existingItem.dataset.mid === String(targetMid)) {
                    return;
                }
                if (row.dataset.jointimePending === String(targetMid) || row.dataset.jointimeChecked === String(targetMid)) {
                    return;
                }

                row.dataset.jointimePending = String(targetMid);
                getSpaceJointime(targetMid).then(info => {
                    if (row.dataset.jointimePending === String(targetMid)) {
                        delete row.dataset.jointimePending;
                    }
                    if (!row.isConnected) return;
                    // 二次校验当前 DOM mid，防止时序竞争导致旧 mid 覆盖新页面
                    const currentDomMid = Number(row.querySelector('.item.uid')?.textContent?.replace(/\D+/g, '')) || this.mid;
                    if (currentDomMid && currentDomMid !== targetMid) return;

                    if (!info) {
                        row.dataset.jointimeChecked = String(targetMid);
                        row.querySelector<HTMLElement>('.item.jointime')?.remove();
                        return;
                    }

                    let item = row.querySelector<HTMLElement>('.item.jointime');
                    if (!item) {
                        item = document.createElement('div');
                        item.className = 'item jointime';
                        row.appendChild(item);
                    }
                    let iconSpan = item.querySelector<HTMLElement>('.icon');
                    if (!iconSpan) {
                        iconSpan = document.createElement('span');
                        iconSpan.className = 'icon';
                        item.insertBefore(iconSpan, item.firstChild);
                    }
                    let textSpan = item.querySelector<HTMLElement>('.text');
                    if (!textSpan) {
                        textSpan = document.createElement('span');
                        textSpan.className = 'text';
                        item.appendChild(textSpan);
                    }
                    item.dataset.mid = String(targetMid);
                    item.title = info.hint || '注册时间';
                    textSpan.textContent = info.text;
                }).catch(e => {
                    if (row.dataset.jointimePending === String(targetMid)) {
                        delete row.dataset.jointimePending;
                    }
                    debug.error('获取或挂载注册时间异常', e);
                });
                return;
            }

            // 2. 兼容新版个人空间
            const newMeta = document.querySelector<HTMLElement>('.section.user-info .user-info-main .meta') ||
                            document.querySelector<HTMLElement>('.section.user-info');
            if (newMeta) {
                const targetMid = this.mid || this.resolveMid();
                if (!targetMid) return;

                const existingItem = document.querySelector<HTMLElement>('.info-regtime');
                if (existingItem && existingItem.dataset.mid === String(targetMid)) {
                    return;
                }
                if (newMeta.dataset.jointimePending === String(targetMid) || newMeta.dataset.jointimeChecked === String(targetMid)) {
                    return;
                }

                newMeta.dataset.jointimePending = String(targetMid);
                getSpaceJointime(targetMid).then(info => {
                    if (newMeta.dataset.jointimePending === String(targetMid)) {
                        delete newMeta.dataset.jointimePending;
                    }
                    if (!newMeta.isConnected) return;
                    const currentMid = this.mid || this.resolveMid();
                    if (currentMid && currentMid !== targetMid) return;

                    if (!info) {
                        newMeta.dataset.jointimeChecked = String(targetMid);
                        document.querySelector<HTMLElement>('.info-regtime')?.remove();
                        return;
                    }

                    let regNode = document.querySelector<HTMLElement>('.info-regtime');
                    if (!regNode) {
                        regNode = document.createElement('div');
                        regNode.className = 'info-regtime';
                        regNode.setAttribute('style', 'display: inline-block;word-break: break-all;');

                        const cmdSpan = document.createElement('span');
                        cmdSpan.className = 'info-command';
                        cmdSpan.setAttribute('style', 'display: inline-block;font-size: 12px;font-family: Microsoft YaHei;line-height: 16px;color: #9499a0;margin-right: 16px;');
                        cmdSpan.textContent = '注册';

                        const valSpan = document.createElement('span');
                        valSpan.className = 'info-value';
                        valSpan.setAttribute('style', 'color: #6d757a;font-family: Microsoft YaHei;font-size: 12px;line-height: 16px;padding-right: 15px;');

                        regNode.appendChild(cmdSpan);
                        regNode.appendChild(valSpan);

                        const targetNode: HTMLElement = newMeta.classList.contains('meta')
                            ? newMeta
                            : (newMeta.querySelector<HTMLElement>('.user-info-main .meta') || <HTMLElement>newMeta.lastElementChild || newMeta);
                        targetNode.appendChild(regNode);
                    }
                    regNode.dataset.mid = String(targetMid);
                    regNode.title = info.hint || '注册时间';
                    let valSpan = regNode.querySelector<HTMLElement>('.info-value');
                    if (!valSpan) {
                        valSpan = document.createElement('span');
                        valSpan.className = 'info-value';
                        regNode.appendChild(valSpan);
                    }
                    valSpan.textContent = info.text;
                }).catch(e => {
                    if (newMeta.dataset.jointimePending === String(targetMid)) {
                        delete newMeta.dataset.jointimePending;
                    }
                    debug.error('获取或挂载新版个人空间注册时间异常', e);
                });
            }
        };

        // 首次轮询挂载
        poll(() => {
            tryMount();
            const oldRow = document.querySelector<HTMLElement>('.user .info .meta .row');
            if (oldRow && (oldRow.querySelector('.item.jointime') || oldRow.dataset.jointimeChecked)) {
                return true;
            }
            const newMeta = document.querySelector<HTMLElement>('.section.user-info');
            if (newMeta && (document.querySelector('.info-regtime') || newMeta.dataset.jointimeChecked)) {
                return true;
            }
            return false;
        }, () => {});

        // 监听后续节点变动（应对SPA切换Tab时右侧个人资料卡片被销毁并重新渲染）
        observerAddedNodes(() => {
            tryMount();
        });
    }

    /** 失效视频 */
    protected lostVideo() {
        // 收藏
        xhrHook('x/v3/fav/resource/list', undefined, async res => {
            try {
                const data = jsonCheck(res.response);
                delete data.data?.ttl; // 修复收藏时间
                if (data.data.medias) {
                    data.data.medias.forEach((d: any) => {
                        d.attr % 2 && this.aids.push(d.id);
                    });
                }
                if (this.aids.length) {
                    const msg = toast.list('失效视频 >>>', '> ' + this.aids.join(' '));
                    this.lostVideoView().then(() => {
                        setTimeout(() => {
                            msg.push('> 数据返回，正在修复~');
                            let resolve = 0, reject = 0;
                            msg.type = 'success';
                            const ele = document.querySelector("#page-fav");
                            if (ele) {
                                const medias = (<any>ele).__vue__.favListDetails.medias;
                                medias?.forEach((d: any) => {
                                    if (d.attr % 2) {
                                        msg.push(`> av${d.id}`);
                                        if (this.aidInfo[d.id].title) {
                                            resolve++;
                                            d.title = this.aidInfo[d.id].title;
                                            msg.push('>' + this.aidInfo[d.id].title);
                                        } else {
                                            reject++;
                                            d.title = `av${d.id}`;
                                            msg.push('> 未能获取到有效信息！');
                                        }
                                        this.aidInfo[d.id].cover && (d.cover = this.aidInfo[d.id].cover);
                                        d.attr = 0;
                                        ele.querySelector(`[data-aid=${d.bvid}]`)?.children[1]?.setAttribute("style", "text-decoration : line-through;color : #ff0000;");
                                    }
                                })
                            }
                            msg.push('> ', `> 修复结束：成功 ${resolve} 失败 ${reject}`);
                            msg.delay = 4;
                        }, 100);
                    });
                }
            } catch { }
        }, false);
    }

    protected lostVideoView() {
        const arr: Promise<void>[] = [];
        while (this.aids.length) {
            arr.push((async () => {
                const d = this.aids.shift()!;
                if (this.aidInfo[d]) return;
                let title!: string, cover!: string;
                await GM.fetch(`//www.biliplus.com/video/av${d}`)
                    .then(d => d.text())
                    .then(d => {
                        if (d.match(/\<title\>.+?\ \-\ AV/)) {
                            title = d.match(/\<title\>.+?\ \-\ AV/)![0].replace(/<title>/, "").replace(/ - AV/, "");
                            cover = d.match(/\<img style=\"display:none\"\ src=\".+?\"\ alt/)![0].replace(/<img style="display:none" src="/, "").replace(/" alt/, "");
                        }
                    })
                    .catch(e => {
                        debug.error(`获取失效视频av${d}信息错误`, 'BILIPLUS', e);
                    });
                if (!title || !cover) {
                    await GM.fetch(`//www.biliplus.com/all/video/av${d}`)
                        .then(d => d.text())
                        .then(d => {
                            if (d.match('/api/view_all?')) {
                                const url = d.match(/\/api\/view_all\?.+?\',cloudmoe/)![0].replace(/\',cloudmoe/, "");
                                return GM.fetch(`//www.biliplus.com${url}`)
                            }
                            throw new Error('无cid缓存');
                        })
                        .then(d => d.json())
                        .then(d => {
                            d = jsonCheck(d);
                            title = title || d.data.info.title
                            cover = cover || d.data.info.pic
                        })
                        .catch(e => {
                            debug.error(`获取失效视频av${d}信息错误`, 'BILIPLUSALL', e);
                        });
                }
                if (!title || !cover) {
                    await GM.fetch(`//www.jijidown.com/video/av${d}`)
                        .then(d => d.text())
                        .then(d => {
                            if (d.match('window._INIT')) {
                                title = title || d.match(/\<title\>.+?\-哔哩哔哩唧唧/)![0].replace(/<title>/, "").replace(/-哔哩哔哩唧唧/, "");
                                cover = cover || d.match(/\"img\":\ \".+?\",/)![0].match(/http.+?\",/)![0].replace(/",/, "");
                            }
                        })
                        .catch(e => {
                            debug.error(`获取失效视频av${d}信息错误`, 'JIJIDOWN', e);
                        });
                }
                cover = cover && cover.replace("http:", "")
                this.aidInfo[d] = { title, cover };
            })());
        }
        return Promise.all(arr);
    }
}