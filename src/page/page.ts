import { toast } from "../core/toast";
import { webpackBlock } from "../utils/hook/webpack";
import { poll } from "../utils/poll";
import { VdomTool } from "../utils/vdomtool";

/** 重写页面基类 */
export abstract class Page {
    /** 页面框架vdom */
    protected vdom!: VdomTool;
    /** 初始化完成 */
    protected initilized = false;
    /** 禁止清除webpackJsonp */
    protected webpackJsonp = false;
    /** 保留__INITIAL_STATE__（仅特定页面需要） */
    protected keepInitialState = false;
    /** 保留新版next-head-count */
    protected keepNextHeadMarker = false;
    /** 阻止原新版页面脚本在旧版模板接管后继续抢占运行时 */
    protected neutralizeScriptPatterns?: readonly RegExp[];
    /**
     * @param html 页面框架
     */
    constructor(html: string) {
        this.updateHtml(html);
        Reflect.defineProperty(window, '_babelPolyfill', {
            configurable: true,
            set: () => true,
            get: () => undefined
        });
    }
    protected updateHtml(html: string) {
        this.vdom = new VdomTool(html);
    }
    /** 重写页面 */
    protected updateDom() {
        // 备份标题
        const title = document.title;
        // 保留新版next-head-count标记，避免新版样式被清理掉导致爆死循环
        const keepNextHeadMarker = this.keepNextHeadMarker || !!document.head?.querySelector('meta[name="next-head-count"]');
        const neutralizeScriptPatterns = this.neutralizeScriptPatterns;
        this.neutralizeOriginalScripts();
        this.cleanupModernRuntime();
        // 清理新版页面注入的 INITIAL_STATE，避免旧版脚本读取到新版结构
        try {
            if (!this.keepInitialState) {
                Reflect.deleteProperty(window, '__INITIAL_STATE__');
            }
        } catch (e) { }
        // 删除webpackJsonp残留
        this.webpackJsonp || Reflect.deleteProperty(window, 'webpackJsonp');
        if (neutralizeScriptPatterns?.length) {
            this.webpackJsonp ? webpackBlock(neutralizeScriptPatterns) : this.guardWebpackJsonp(neutralizeScriptPatterns);
        }
        // 刷新DOM
        this.vdom.replace(document.documentElement);
        keepNextHeadMarker && this.restoreNextHeadMarker();
        // 还原标题
        title && !title.includes("404") && (document.title = title);
        setTimeout(() => this.loadedCallback());
    }
    /** 清理已提前执行的新版页面全局运行时残留（如新版 Vue、VueRouter、UserStatus），防止旧版 vendor.js 触发 Cannot redefine property: $router 等冲突 */
    protected cleanupModernRuntime() {
        const win = <any>window;
        try {
            ['#app', '#video-page-app'].forEach(selector => {
                const el = document.querySelector<any>(selector);
                const vm = el?.__vue__;
                if (vm) {
                    if (vm.$router) {
                        try {
                            vm.$router.push = () => Promise.resolve();
                            vm.$router.replace = () => Promise.resolve();
                            vm.$router.go = () => { };
                        } catch (e) { }
                    }
                    try {
                        vm.$destroy?.();
                    } catch (e) { }
                    try {
                        el.__vue__ = null;
                    } catch (e) { }
                }
            });
        } catch (e) { }
        try {
            // 新版 video.js 会把内部已安装 VueRouter 的 Vue 暴露到 window.Vue（且 $router/$route 为不可配置属性）
            // 旧版 vendor.js 加载 vue-router 时若检测到 window.Vue 会自动执行 window.Vue.use(VueRouter) 导致重定义 $router 抛异常直接崩溃
            if (win.Vue) {
                try {
                    if (win.Vue.prototype) {
                        win.Vue.prototype.$mount = function () { return this; };
                    }
                } catch (e) { }
                Reflect.deleteProperty(window, 'Vue');
            }
        } catch (e) { }
        try {
            // 新版 header-v2 会设置不兼容的 window.UserStatus（缺少 onLoaded / loadLoginStatus），导致旧版 header.js 和 video.js 跳过初始化
            if (win.UserStatus && typeof win.loadLoginStatus !== 'function') {
                Reflect.deleteProperty(window, 'UserStatus');
                Reflect.deleteProperty(window, 'onLoginInfoLoaded');
            }
        } catch (e) { }
    }
    /** 阻止原新版页面脚本与旧版模板脚本抢同一个 webpackJsonp/DOM 运行时 */
    protected neutralizeOriginalScripts() {
        const patterns = this.neutralizeScriptPatterns;
        if (!patterns?.length) return;
        Array.from(document.scripts).forEach(script => {
            if (script === document.currentScript) return;
            const src = script.src || script.getAttribute('src') || '';
            if (src && patterns.some(pattern => pattern.test(src))) {
                script.type = 'javascript/blocked';
                script.removeAttribute('src');
                script.textContent = '';
                script.remove();
            }
        });
    }
    protected guardWebpackJsonp(patterns: readonly RegExp[]) {
        const win = <any>window;
        let value = win.webpackJsonp;
        const shouldBlock = () => {
            const currentScript = document.currentScript;
            const src = currentScript instanceof HTMLScriptElement ? currentScript.src : '';
            return !!src && patterns.some(pattern => pattern.test(src));
        };
        const wrapPush = () => {
            const target = value;
            if (!target || typeof target.push !== 'function' || target.push.__BLOD_WEBPACK_GUARD__) return;
            const originalPush = target.push;
            const guardedPush = function (this: any, ...args: any[]) {
                return shouldBlock() ? this.length : originalPush.apply(this, args);
            };
            Object.defineProperty(guardedPush, '__BLOD_WEBPACK_GUARD__', { value: true });
            target.push = guardedPush;
        };
        Reflect.defineProperty(window, 'webpackJsonp', {
            configurable: true,
            get: () => value,
            set: next => {
                value = next;
                if (shouldBlock() && Array.isArray(value)) {
                    value.length = 0;
                }
                wrapPush();
            }
        });
        wrapPush();
        const timer = setInterval(wrapPush, 50);
        setTimeout(() => {
            clearInterval(timer);
            try {
                const current = win.webpackJsonp;
                Reflect.deleteProperty(window, 'webpackJsonp');
                win.webpackJsonp = current;
            } catch (e) { }
        }, 10000);
    }
    // Restore next-head-count for residual Next.js head updates.
    protected restoreNextHeadMarker() {
        const head = document.head;
        if (!head) return;
        let marker = head.querySelector<HTMLMetaElement>('meta[name="next-head-count"]');
        if (!marker) {
            marker = document.createElement('meta');
            marker.name = 'next-head-count';
        }
        marker.content = '0';
        head.appendChild(marker);
    }
    /** 重写完成回调 */
    protected loadedCallback() {
        this.initilized = true;
        this.vdom.scriptsReady.then(() => {
            poll(() => document.readyState === "complete", () => {
                document.querySelector("#jvs-cert") || window.dispatchEvent(new ProgressEvent("load"));
            });
        });
    }
}
