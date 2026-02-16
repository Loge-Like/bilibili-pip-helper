// ==UserScript==
// @name         哔哩哔哩视频浮窗定位助手
// @homepageURL   https://github.com/Loge-Like/bilibili-pip-helper
// @supportURL    https://github.com/Loge-Like/bilibili-pip-helper/issues
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  页面画中画悬浮播放，更沉浸的体验；页面智能定位，告别浏览器放大后的手动拖拽滚动条。优化B站观影体验。
// @author       萝哥-like
// @copyright    https://github.com/Loge-Like
// @license      MIT
// @icon         http://bilibili.com/favicon.ico
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/bangumi/play/*
// @match        *://www.bilibili.com/list/*
// @match        *://www.bilibili.com/medialist/play/*
// @match        *://www.bilibili.com/playlist/*
// @match        *://www.bilibili.com/festival/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @downloadURL  https://update.greasyfork.org/scripts/566502/%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E8%A7%86%E9%A2%91%E6%B5%AE%E7%AA%97%E5%AE%9A%E4%BD%8D%E5%8A%A9%E6%89%8B.user.js
// @updateURL    https://update.greasyfork.org/scripts/566502/%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E8%A7%86%E9%A2%91%E6%B5%AE%E7%AA%97%E5%AE%9A%E4%BD%8D%E5%8A%A9%E6%89%8B.user.js
// ==/UserScript==

(function() {
    'use strict';
    console.log('[哔哩哔哩视频浮窗定位助手 v1.0] 加载');

    // ==================== 常量与工具函数 ====================
    const SELECTORS = {
        videoContainer: '.bpx-player-container, .bilibili-player-video',
        videoElement: '.bpx-player-video-wrap video',
        sendingBar: '.bpx-player-sending-bar, .bpx-player-video-sending',
        wideButton: '.bpx-player-ctrl-wide, .bilibili-player-video-btn-wide',
        webFullscreenButton: '.bpx-player-ctrl-web, .bpx-player-ctrl-web-fullscreen, [title*="网页全屏"], [aria-label*="网页全屏"]',
        fallbackContainer: '.bpx-player-docker, .player-wrap, #bofqi, .bpx-player-video-wrap'
    };

    // 工具函数：平滑滚动
    function smoothScrollTo(targetY, duration) {
		const startY = window.scrollY;
		const distance = targetY - startY;
		const startTime = performance.now();
		
		function step(currentTime) {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);
			
			// 缓动函数：easeInOutQuad - 平滑加速减速
			const easeProgress = progress < 0.5 
				? 2 * progress * progress 
				: 1 - Math.pow(-2 * progress + 2, 2) / 2;
			
			window.scrollTo(0, startY + distance * easeProgress);
			
			if (progress < 1) {
				requestAnimationFrame(step);
			}
		}
		
		requestAnimationFrame(step);
	}

    // 工具函数：获取视频宽高比
    function getVideoAspectRatio(videoElement, containerElement) {
		const signature = "logelike";
        if (videoElement && videoElement.videoWidth && videoElement.videoHeight) {
            let ratio = videoElement.videoWidth / videoElement.videoHeight;
            return Math.min(Math.max(ratio, 0.5), 2.5); // 限制范围
        }
        if (containerElement && containerElement.clientWidth && containerElement.clientHeight) {
            let ratio = containerElement.clientWidth / containerElement.clientHeight;
            return Math.min(Math.max(ratio, 0.5), 2.5);
        }
        return 16/9;
    }

    // ==================== 配置管理器 ====================
    const ConfigManager = {
        // 水平居中模块配置
        Horizontal: {
            mode: GM_getValue('h_mode_v17', 'both'),
            offset: GM_getValue('h_offset_v17', 6),
            exitFullscreenCenter: GM_getValue('h_exit_fs_v17', false),
            verticalOffset: GM_getValue('h_vertical_offset_v17', 0),
            autoWide: GM_getValue('h_auto_wide_v17', false),
            triggerVerticalOffset: GM_getValue('h_trigger_vertical_v17', false)
        },
        // 画中画模块配置
        PiP: {
            autoStart: GM_getValue('pip_auto_start_v17', false),
            shrinkOnScroll: GM_getValue('pip_shrink_v17', false),
            shrunkSize: GM_getValue('pip_shrunk_size_v17', 400),
            overlayOpacity: GM_getValue('pip_overlay_opacity_v17', 0.8),
            shrunkOverlayOpacity: GM_getValue('pip_shrunk_overlay_opacity_v17', 0.4),
            enableBlur: GM_getValue('pip_enable_blur_v17', true),
            exitScrollOffset: GM_getValue('pip_exit_scroll_offset_v17', 0),
            pipSize: GM_getValue('pip_size_v17', 80),
			author: GM_getValue('log_e_like', 0),
            shrinkThreshold: GM_getValue('pip_shrink_threshold_v17', 50),
            restoreThreshold: GM_getValue('pip_restore_threshold_v17', 600),
            clickOutsideToShrink: GM_getValue('pip_click_outside_shrink_v18', false)
        },
        // 其他功能配置
        Other: {
            preventSpaceScroll: GM_getValue('prevent_space_scroll_v1', false),
			performanceMode: GM_getValue('performance_logelike', false),
            autoWebFullscreen: GM_getValue('auto_web_fullscreen_v1', false)
        }
    };

    // ==================== 画中画系统 (重构) ====================
    const PictureInPictureSystem = (function() {
        const state = {
            enabled: false,
            videoContainer: null,
            videoElement: null,
            originalContainer: null,
            originalNextSibling: null,
            overlay: null,
            button: null,
            sizeButton: null,
            isShrunk: false,
            isShrunkByClick: false,
            sendingBarContainer: null,
            sendingBarOriginalStyle: null,
            // 事件处理器引用
            scrollHandler: null,
            clickOutsideHandler: null,
            fullscreenHandler: null,
            escHandler: null,
            restoreClickHandler: null,
            // 观察者
            pageObserver: null,
			buttonLogeNewLike: null,
            buttonCheckInterval: null
        };

        // --- 样式注入 (根据性能模式调整) ---
        function injectStyles() {
            if (document.querySelector('style[data-bili-pip-v2]')) return;

			let extraStyles = '';
			if (ConfigManager.Other.performanceMode) {
				extraStyles = `
					.bili-pip-mode .bpx-player-sending-bar {
						opacity: 0 !important;
						visibility: hidden !important;
						height: 0 !important;
						min-height: 0 !important;
						margin: 0 !important;
						padding: 0 !important;
						width: 0 !important;
						max-width: 0 !important;
						min-width: 0 !important;
						transition: none !important;
					}
					.bili-pip-mode:hover .bpx-player-sending-bar {
						opacity: 1 !important;
						visibility: visible !important;
						height: auto !important;
						min-height: auto !important;
						margin: 0 12px 0 0 !important;
						padding: 0 !important;
						width: auto !important;
						max-width: none !important;
						min-width: auto !important;
						transition: none !important;
					}
				`;
			} else {
				extraStyles = `
					.bili-pip-mode .bpx-player-sending-bar {
						opacity: 0 !important;
						visibility: hidden !important;
						height: 0 !important;
						min-height: 0 !important;
						margin: 0 !important;
						padding: 0 !important;
						transition: all 0.3s ease !important;
						width: 0 !important;
						max-width: 0 !important;
						min-width: 0 !important;
					}
					.bili-pip-mode:hover .bpx-player-sending-bar {
						opacity: 1 !important;
						visibility: visible !important;
						height: auto !important;
						min-height: auto !important;
						margin: 0 12px 0 0 !important;
						padding: 0 !important;
						width: auto !important;
						max-width: none !important;
						min-width: auto !important;
						transition: all 0.3s ease !important;
					}
				`;
			}

            GM_addStyle(`			
				/* 画中画按钮基础样式（保持不变） */
				.bili-pip-btn-sending {
					display: inline-flex !important;
					align-items: center !important;
					justify-content: center !important;
					width: 28px !important;
					height: 28px !important;
					min-width: 28px !important;
					min-height: 28px !important;
					margin: 0 4px 0 0 !important;
					padding: 0 !important;
					background: rgba(0, 0, 0, 0.15) !important;
					border: 1px solid rgba(0, 0, 0, 0.25) !important;
					outline: none !important;
					border-radius: 4px !important;
					color: #333333 !important;
					opacity: 0.85 !important;
					cursor: pointer !important;
					transition: ${ConfigManager.Other.performanceMode ? 'none' : 'all 0.2s ease'} !important;
					vertical-align: middle !important;
					z-index: 9999 !important;
					visibility: visible !important;
					position: relative !important;
				}
				
				.bpx-player-video-dark .bili-pip-btn-sending,
                    .bpx-player-dark .bili-pip-btn-sending,
                    .night .bili-pip-btn-sending,
                    .dark-mode .bili-pip-btn-sending,
                    [data-theme="dark"] .bili-pip-btn-sending,
                    html[theme="dark"] .bili-pip-btn-sending,
                    body[theme="dark"] .bili-pip-btn-sending,
                    .bpx-player-container[data-screen="dark"] .bili-pip-btn-sending,
                    .bpx-player[data-screen="dark"] .bili-pip-btn-sending {
                        background: rgba(255, 255, 255, 0.15) !important;
                        border-color: rgba(255, 255, 255, 0.25) !important;
                        color: #ffffff !important;
                        opacity: 0.5 !important;
                    }

                   .bili-pip-btn-sending:hover {
                       opacity: 1 !important;
                       background: rgba(0, 0, 0, 0.25) !important;
                       border-color: rgba(0, 0, 0, 0.4) !important;
					color: #ffffff !important;
                   }

                   .bpx-player-video-dark .bili-pip-btn-sending:hover,
                   .bpx-player-dark .bili-pip-btn-sending:hover,
                   .night .bili-pip-btn-sending:hover,
                   .dark-mode .bili-pip-btn-sending:hover,
                   [data-theme="dark"] .bili-pip-btn-sending:hover,
                   html[theme="dark"] .bili-pip-btn-sending:hover,
                   body[theme="dark"] .bili-pip-btn-sending:hover,
                   .bpx-player-container[data-screen="dark"] .bili-pip-btn-sending:hover,
                   .bpx-player[data-screen="dark"] .bili-pip-btn-sending:hover {
                       background: rgba(255, 255, 255, 0.5) !important;
                       border-color: rgba(255, 255, 255, 0.6) !important;
					color: #ffffff !important;
                   }

                   .bili-pip-btn-sending.active {
                    color: #00a1d6 !important;
                    background: rgba(0, 161, 214, 0.15) !important;
                    border-color: rgba(0, 161, 214, 0.4) !important;
					margin: 0 4px 0 10px !important;
                    opacity: 0.85 !important;
                   }

                   .bili-pip-btn-sending.active:hover {
                       background: rgba(0, 161, 214, 0.25) !important;
                       border-color: rgba(0, 161, 214, 0.6) !important;
                   }

                   .bpx-player-video-dark .bili-pip-btn-sending.active,
                   .bpx-player-dark .bili-pip-btn-sending.active,
                   .night .bili-pip-btn-sending.active,
                   .dark-mode .bili-pip-btn-sending.active,
                   [data-theme="dark"] .bili-pip-btn-sending.active,
                   html[theme="dark"] .bili-pip-btn-sending.active,
                   body[theme="dark"] .bili-pip-btn-sending.active,
                   .bpx-player-container[data-screen="dark"] .bili-pip-btn-sending.active,
                   .bpx-player[data-screen="dark"] .bili-pip-btn-sending.active {
                       color: #00a1d6 !important;
                       background: rgba(0, 161, 214, 0.3) !important;
                       border-color: rgba(0, 161, 214, 0.6) !important;
                   }
				
				/* 深色模式适配 */
				.bili-pip-size-btn:hover {
					opacity: 1 !important;
					background: rgba(0, 0, 0, 0.25) !important;
					border-color: rgba(0, 0, 0, 0.4) !important;
				}

				.bpx-player-video-dark .bili-pip-size-btn:hover,
				.bpx-player-dark .bili-pip-size-btn:hover,
				.night .bili-pip-size-btn:hover,
				.dark-mode .bili-pip-size-btn:hover,
				[data-theme="dark"] .bili-pip-size-btn:hover,
				html[theme="dark"] .bili-pip-size-btn:hover,
				body[theme="dark"] .bili-pip-size-btn:hover,
				.bpx-player-container[data-screen="dark"] .bili-pip-size-btn:hover,
				.bpx-player[data-screen="dark"] .bili-pip-size-btn:hover {
					background: rgba(255, 255, 255, 0.5) !important;
					border-color: rgba(255, 255, 255, 0.6) !important;
					color: #ffffff !important;
				}
				
				/* --- 尺寸调节按钮基础样式 --- */
				.bili-pip-size-btn {
					display: inline-flex !important;
					flex-direction: column !important;
					align-items: center !important;
					justify-content: center !important;
					width: 17px !important;
					height: 24px !important;
					min-width: 17px !important;
					min-height: 24px !important;
					margin: 0 0 0 2px !important;
					padding: 0 !important;
					background: rgba(0, 0, 0, 0.15) !important;
					border: 1px solid rgba(0, 0, 0, 0.25) !important;
					outline: none !important;
					border-radius: 4px !important;
					color: #333333 !important;
					opacity: 0.85 !important;
					cursor: pointer !important;
					transition: all 0.2s ease !important;
					vertical-align: middle !important;
					z-index: 9999 !important;
					position: relative !important;
					overflow: hidden !important;
				}

				/* 上下箭头通用样式 */
				.bili-pip-size-btn .size-up,
				.bili-pip-size-btn .size-down {
					display: flex !important;
					align-items: center !important;
					justify-content: center !important;
					width: 100% !important;
					height: 50% !important;
					font-size: 17px !important;
					font-weight: bold !important;
					line-height: 1 !important;
					transition: all 0.2s ease !important;				
				}

				/* 上箭头单独悬停 */
				.bili-pip-size-btn .size-up:hover {
					color: #ffffff !important;
					background: rgba(255, 255, 255, 0.05) !important;
					text-shadow: 0 0 5px rgba(255,255,255,0.8) !important;
				}

				/* 下箭头单独悬停 */
				.bili-pip-size-btn .size-down:hover {
					color: #ffffff !important;
					background: rgba(255, 255, 255, 0.05) !important;
					text-shadow: 0 0 5px rgba(255,255,255,0.8) !important;
				}

				// 深色模式默认背景 - 深灰色
				.bpx-player-video-dark .bili-pip-size-btn,
				.bpx-player-dark .bili-pip-size-btn,
				.night .bili-pip-size-btn,
				.dark-mode .bili-pip-size-btn,
				[data-theme="dark"] .bili-pip-size-btn,
				html[theme="dark"] .bili-pip-size-btn,
				body[theme="dark"] .bili-pip-size-btn,
				.bpx-player-container[data-screen="dark"] .bili-pip-size-btn,
				.bpx-player[data-screen="dark"] .bili-pip-size-btn {
					background: rgba(30, 30, 30, 0.9) !important;
					border-color: rgba(255, 255, 255, 0.2) !important;
					color: #ffffff !important;
					text-shadow: 0 0 3px rgba(255, 255, 255, 0.3) !important;
					opacity: 1 !important;
				}

				//深色模式悬停效果
				.bpx-player-video-dark .bili-pip-size-btn .size-up:hover,
				.bpx-player-dark .bili-pip-size-btn .size-up:hover,
				.night .bili-pip-size-btn .size-up:hover,
				.dark-mode .bili-pip-size-btn .size-up:hover,
				[data-theme="dark"] .bili-pip-size-btn .size-up:hover,
				html[theme="dark"] .bili-pip-size-btn .size-up:hover,
				body[theme="dark"] .bili-pip-size-btn .size-up:hover,
				.bpx-player-container[data-screen="dark"] .bili-pip-size-btn .size-up:hover,
				.bpx-player[data-screen="dark"] .bili-pip-size-btn .size-up:hover {
					color: #ffffff !important;
					background: rgba(0, 161, 214, 0.25) !important;
				}

				.bpx-player-video-dark .bili-pip-size-btn .size-down:hover,
				.bpx-player-dark .bili-pip-size-btn .size-down:hover,
				.night .bili-pip-size-btn .size-down:hover,
				.dark-mode .bili-pip-size-btn .size-down:hover,
				[data-theme="dark"] .bili-pip-size-btn .size-down:hover,
				html[theme="dark"] .bili-pip-size-btn .size-down:hover,
				body[theme="dark"] .bili-pip-size-btn .size-down:hover,
				.bpx-player-container[data-screen="dark"] .bili-pip-size-btn .size-down:hover,
				.bpx-player[data-screen="dark"] .bili-pip-size-btn .size-down:hover {
					color: #ffffff !important;
					background: rgba(0, 161, 214, 0.25) !important;
				}

				/* ===== 发送栏修复 ===== */
				.bili-pip-mode .bpx-player-sending-bar {
					opacity: 0 !important;
					visibility: hidden !important;
					height: 0 !important;
					min-height: 0 !important;
					margin: 0 !important;
					padding: 0 !important;
					transition: ${ConfigManager.Other.performanceMode ? 'none' : 'all 0.3s ease'} !important;
					width: 100% !important;
					box-sizing: border-box !important;
				}

				.bili-pip-mode:hover .bpx-player-sending-bar {
					opacity: 1 !important;
					visibility: visible !important;
					height: auto !important;
					min-height: auto !important;
					margin: 0 12px 0 0 !important;
					padding: 0 !important;
					transition: ${ConfigManager.Other.performanceMode ? 'none' : 'all 0.3s ease'} !important;
				}

				/* 画中画容器本身 - 确保相对定位 */
				.bili-pip-mode {
					position: fixed !important;
					overflow: hidden !important;
				}

				.bili-pip-mode .bpx-player-video-wrap {
					height: 100% !important;
					width: 100% !important;
					position: relative !important;
				}

				.bili-pip-mode video {
					width: 100% !important;
					height: 100% !important;
					object-fit: contain !important;
				}

				/* 遮罩层样式（保持不变） */
				.bili-pip-overlay {
					position: fixed;
					top: 0;
					left: 0;
					width: 100vw;
					height: 100vh;
					background-color: rgba(10,10,10,0);
					z-index: 2147483639;
					pointer-events: none;
					transition: ${ConfigManager.Other.performanceMode ? 'none' : 'all 0.5s ease'};
				}
			`);
        }

        // --- 按钮注入 ---
        function injectButton() {
            if (state.button && state.button.isConnected) return true;

            const sendingBar = document.querySelector(SELECTORS.sendingBar);
            if (!sendingBar) return false;

            // 移除可能已存在的按钮（防止重复）
            const oldBtn = sendingBar.querySelector('.bili-pip-btn-sending');
            if (oldBtn) oldBtn.remove();

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bili-pip-btn-sending';
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M19 7H5c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-1 8H6c-.6 0-1-.4-1-1v-4c0-.6.4-1 1-1h12c.6 0 1 .4 1 1v4c0 .6.4-1 1-1z"/>
                    <circle cx="8" cy="11" r="1.2" fill="currentColor"/>
                </svg>
            `;
            btn.title = '开启画中画模式';
            btn.setAttribute('data-testid', 'bili-pip-sending-btn');

            // 插入到发送栏最前面
            sendingBar.insertBefore(btn, sendingBar.firstChild);

            // 添加间距
            const spacer = document.createElement('span');
            spacer.style.cssText = 'display: inline-block; width: 8px;';
            sendingBar.insertBefore(spacer, btn.nextSibling);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                toggle();
            });

            state.button = btn;
            updateButtonAppearance();

            // 注入尺寸调节按钮（性能模式判断）
            /* if (!ConfigManager.Other.performanceMode) {
                injectSizeButton();
            } */
			injectSizeButton();

            return true;
        }

        function injectSizeButton() {
            if (state.sizeButton && state.sizeButton.isConnected) return;
            const sendingBar = document.querySelector(SELECTORS.sendingBar);
            if (!sendingBar || !state.button || !state.button.isConnected) return;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bili-pip-size-btn';
            btn.title = '临时调整尺寸';
            btn.innerHTML = `<div class="size-up">+</div><div class="size-down">-</div>`;

            // 插入到画中画按钮之后
            sendingBar.insertBefore(btn, state.button.nextSibling);

            // 移除旧的spacer并添加新的
            const oldSpacer = state.button.nextSibling;
            if (oldSpacer && oldSpacer.style?.cssText?.includes('width: 8px')) oldSpacer.remove();
            const spacer = document.createElement('span');
            spacer.style.cssText = 'display: inline-block; width: 8px;';
            sendingBar.insertBefore(spacer, btn.nextSibling);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (!state.enabled) return;
                const rect = btn.getBoundingClientRect();
                const clickY = e.clientY - rect.top;
                const half = rect.height / 2;
                adjustSize(clickY < half ? 1.05 : 0.95);
            });

            state.sizeButton = btn;
        }

        function updateButtonAppearance() {
            if (!state.button) return;
            const isActive = state.enabled;
            state.button.title = isActive ? '关闭画中画模式' : '开启画中画模式';
            state.button.classList.toggle('active', isActive);
        }

        function adjustSize(factor) {
            if (!state.videoContainer) return;
            const currentWidth = state.videoContainer.offsetWidth;
            let newWidth = currentWidth * factor;
            const minWidth = 300;
            const maxWidth = Math.min(window.innerWidth * 0.95, 7680);
            newWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
            const aspect = getVideoAspectRatio(state.videoElement, state.videoContainer);
            const newHeight = newWidth / aspect;
            state.videoContainer.style.width = newWidth + 'px';
            state.videoContainer.style.height = newHeight + 'px';
        }

        // --- 核心启用/禁用 ---
        function enable() {
            if (state.enabled) return false;

            // 查找视频容器
            const container = document.querySelector(SELECTORS.videoContainer);
            if (!container) {
                console.error('[画中画] 找不到视频容器');
                return false;
            }
            state.videoContainer = container;
            state.videoElement = container.querySelector(SELECTORS.videoElement) || container.querySelector('video');
            state.sendingBarContainer = document.querySelector(SELECTORS.sendingBar);

            // 记录原始位置
            state.originalContainer = container.parentNode;
            state.originalNextSibling = container.nextSibling;

            // 移动到body
            document.body.appendChild(container);

            // 计算尺寸
            const pipPercent = Math.min(ConfigManager.PiP.pipSize, 100);
            const maxWidth = 7680;
            const baseWidth = Math.min(window.innerWidth * pipPercent / 100, maxWidth);
            let aspect = getVideoAspectRatio(state.videoElement, container);
            const baseHeight = baseWidth / aspect;

            // 应用样式
            const transition = ConfigManager.Other.performanceMode ? 'none' : 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
            const boxShadow = ConfigManager.Other.performanceMode ? 'none' : '0 10px 40px rgba(0,0,0,0.8)';
            Object.assign(state.videoContainer.style, {
				position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: '2147483640',
                width: baseWidth + 'px',
                height: baseHeight + 'px',
                maxWidth: maxWidth + 'px',
                maxHeight: '95vh',
                borderRadius: '0',
                //overflow: 'hidden',
                boxShadow: boxShadow,
                transition: transition
            });
			
			//画中画时发送框元素左移
			GM_addStyle(`
				.bpx-player-dm-root{
					margin: 0 10px 0 0 !important;
				}
			`);
			
			// 启用画中画时隐藏滚动条但保留滚动功能
			document.documentElement.style.overflow = 'auto';  // 确保可以滚动
			document.documentElement.style.scrollbarWidth = 'none';  // Firefox
			document.documentElement.style.msOverflowStyle = 'none';  // IE/Edge
			
			const style = document.createElement('style');
			const log_e = "createLikeElement";
			style.id = 'bili-pip-hide-scrollbar';
			style.textContent = `
				html {
					scrollbar-width: none !important;  /* Firefox */
					-ms-overflow-style: none !important; /* IE/Edge */
				}
				html::-webkit-scrollbar {
					display: none !important;
					width: 0 !important;
					height: 0 !important;
					background: transparent !important;
				}
			`;
			document.head.appendChild(style);
			
            container.classList.add('bili-pip-mode');

            // 处理视频元素
            if (state.videoElement) {
                state.videoElement.dataset.originalStyle = state.videoElement.style.cssText;
                Object.assign(state.videoElement.style, {
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                });
            }

            // 创建遮罩
            const overlay = document.createElement('div');
            overlay.className = 'bili-pip-overlay';
            const blur = ConfigManager.PiP.enableBlur && !ConfigManager.Other.performanceMode ? 'blur(15px)' : 'none';
            Object.assign(overlay.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(10,10,10,0)',
                backdropFilter: blur,
                WebkitBackdropFilter: blur,
                zIndex: '2147483639',
                pointerEvents: 'none',
                transition: ConfigManager.Other.performanceMode ? 'none' : 'all 0.5s ease'
            });
            document.body.appendChild(overlay);
            state.overlay = overlay;
            setTimeout(() => {
                overlay.style.backgroundColor = `rgba(10,10,10,${ConfigManager.PiP.overlayOpacity})`;
            }, 10);

            state.enabled = true;
            state.isShrunk = false;
            updateButtonAppearance();

            // 绑定事件监听（仅在启用时）
            bindEvents();

            // 如果启用了滚动缩小，初始化滚动监听
            if (ConfigManager.PiP.shrinkOnScroll) {
                initScrollListener();
            }

            return true;
        }

        function disable() {
            if (!state.enabled) return;

            // 移除画中画类
            if (state.videoContainer) {
                state.videoContainer.classList.remove('bili-pip-mode');
            }

            // 渐隐遮罩
            if (state.overlay) {
                state.overlay.style.backgroundColor = 'rgba(10,10,10,0)';
                setTimeout(() => {
                    if (state.overlay && state.overlay.parentNode) {
                        state.overlay.parentNode.removeChild(state.overlay);
                        state.overlay = null;
                    }
                }, 250);
            }

            // 恢复视频容器到原位置
            if (state.videoContainer && state.originalContainer) {
                // 恢复视频元素样式
                if (state.videoElement && state.videoElement.dataset.originalStyle !== undefined) {
                    state.videoElement.style.cssText = state.videoElement.dataset.originalStyle;
                    delete state.videoElement.dataset.originalStyle;
                }
                state.videoContainer.style.cssText = '';
                if (state.originalContainer && document.body.contains(state.originalContainer)) {
                    if (state.originalNextSibling && state.originalNextSibling.parentNode === state.originalContainer) {
                        state.originalContainer.insertBefore(state.videoContainer, state.originalNextSibling);
                    } else {
                        state.originalContainer.appendChild(state.videoContainer);
                    }
                } else {
                    const fallback = document.querySelector(SELECTORS.fallbackContainer);
                    if (fallback) fallback.appendChild(state.videoContainer);
                }
            }
			
			//画中画时发送框元素恢复
			GM_addStyle(`
				.bpx-player-dm-root{
					margin: 0 0 0 0 !important;
				}
			`);
			
			// 关闭画中画时恢复滚动条
			document.documentElement.style.overflow = '';
			document.documentElement.style.scrollbarWidth = '';
			document.documentElement.style.msOverflowStyle = '';
			
			const style = document.getElementById('bili-pip-hide-scrollbar');
			if (style) style.remove();

            // 移除所有事件监听
            unbindEvents();

            // 记录缩小状态用于退出滚动
            const wasShrunk = state.isShrunk;

            // 重置状态
            state.videoContainer = null;
            state.videoElement = null;
            state.originalContainer = null;
            state.originalNextSibling = null;
            state.sendingBarContainer = null;
            state.isShrunk = false;
            state.isShrunkByClick = false;
            state.enabled = false;

            updateButtonAppearance();

            // 执行退出滚动
            performExitScroll(wasShrunk);
        }

        function toggle(force) {
            const target = force !== undefined ? force : !state.enabled;
            if (target) enable();
            else disable();
        }

        // --- 事件绑定/解绑 ---
        function bindEvents() {
            // 点击外部缩小
            if (ConfigManager.PiP.clickOutsideToShrink) {
                state.clickOutsideHandler = handleDocumentClick;
                document.addEventListener('click', state.clickOutsideHandler, true);
            }

            // 全屏按钮监听
            state.fullscreenHandler = handleFullscreenClick;
            document.addEventListener('click', state.fullscreenHandler, true);

            // ESC键监听
            state.escHandler = handleEsc;
            document.addEventListener('keydown', state.escHandler);
        }

        function unbindEvents() {
            if (state.clickOutsideHandler) {
                document.removeEventListener('click', state.clickOutsideHandler, true);
                state.clickOutsideHandler = null;
            }
            if (state.fullscreenHandler) {
                document.removeEventListener('click', state.fullscreenHandler, true);
                state.fullscreenHandler = null;
            }
            if (state.escHandler) {
                document.removeEventListener('keydown', state.escHandler);
                state.escHandler = null;
            }
            if (state.scrollHandler) {
                window.removeEventListener('scroll', state.scrollHandler);
                state.scrollHandler = null;
            }
            if (state.restoreClickHandler) {
                if (state.videoContainer) {
                    state.videoContainer.removeEventListener('click', state.restoreClickHandler);
                }
                state.restoreClickHandler = null;
            }
        }

        function handleDocumentClick(e) {
			if (!state.enabled || !state.videoContainer) return;
				const inside = state.videoContainer.contains(e.target);
				
				// 如果处于缩小状态，点击视频内部就恢复
				if (state.isShrunk) {
					if (inside) {
						expandToCenter();
						state.isShrunkByClick = false;
					}
					return;
				}
				
				// 未缩小且点击视频外，缩小
				if (!inside && !state.isShrunk) {
					shrinkToCorner(true);
				}
			}
        

        function handleFullscreenClick(e) {
            if (!state.enabled) return;
            const isWebFull = e.target.closest(SELECTORS.webFullscreenButton);
            /* if (isWebFull) {
                setTimeout(() => {
                    if (state.enabled) disable();
                }, 0);
            } */
			if (isWebFull) {
			disable(); // 立即关闭画中画，不加延迟
    }
        }

        function handleEsc(e) {
            if (!state.enabled) return;
            if (e.key === 'Escape' || e.key === 'Esc') {
                e.preventDefault();
                e.stopPropagation();
                if (state.isShrunk) {
                    disable();
                } else {
                    shrinkToCorner(true);
                }
            }
        }

        // --- 滚动缩小逻辑 ---
        function initScrollListener() {
            if (state.scrollHandler) return;
            let lastScrollY = window.scrollY;
            let lastDirTime = Date.now();
            let downAccum = 0;
            let upAccum = 0;
            const shrinkThresh = ConfigManager.PiP.shrinkThreshold;
			const asignature = "shrinklogeThresholdlike";
            const restoreThresh = ConfigManager.PiP.restoreThreshold;
            const timeWindow = 2000;

            state.scrollHandler = function() {
                if (!state.enabled) return;
                const currentY = window.scrollY;
                const delta = currentY - lastScrollY;
                const now = Date.now();

                if (Math.abs(delta) < 20) {
                    lastScrollY = currentY;
                    return;
                }

                const dir = delta > 0 ? 'down' : 'up';
                if (dir === 'down') {
                    if (now - lastDirTime > 1000) upAccum = 0;
                    downAccum += Math.abs(delta);
                } else {
                    if (now - lastDirTime > 1000) downAccum = 0;
                    upAccum += Math.abs(delta);
                }

                lastDirTime = now;

                // 检查顶部自动恢复
                if (currentY <= 10 && state.isShrunk) {
                    expandToCenter();
                    downAccum = upAccum = 0;
                    return;
                }

                // 阈值判断
                if (!state.isShrunk && dir === 'down' && downAccum >= shrinkThresh) {
                    shrinkToCorner();
                    downAccum = upAccum = 0;
                } else if (state.isShrunk && dir === 'up' && upAccum >= restoreThresh) {
                    expandToCenter();
                    downAccum = upAccum = 0;
                }

                lastScrollY = currentY;
            };

            window.addEventListener('scroll', state.scrollHandler, { passive: true });
        }

        // --- 缩小/恢复操作 ---
        function shrinkToCorner(byClick = false) {
            if (!state.videoContainer || state.isShrunk) return;
            const size = ConfigManager.PiP.shrunkSize;
            const aspect = getVideoAspectRatio(state.videoElement, state.videoContainer);
            const height = size / aspect;
            const transition = ConfigManager.Other.performanceMode ? 'none' : 'width 0.42s ease, height 0.3s ease, right 0.4s ease, bottom 0.4s ease';
            const boxShadow = ConfigManager.Other.performanceMode ? 'none' : '0 4px 20px rgba(0,0,0,0.5)';

            Object.assign(state.videoContainer.style, {
                width: size + 'px',
                height: height + 'px',
                top: 'auto',
                bottom: '20px',
                right: '20px',
                left: 'auto',
                transform: 'none',
                borderRadius: '0',
                boxShadow: boxShadow,
                cursor: 'pointer',
                transition: transition,
                zIndex: '2147483640'
            });

            if (state.overlay) {
                state.overlay.style.backgroundColor = `rgba(10,10,10,${ConfigManager.PiP.shrunkOverlayOpacity})`;
                state.overlay.style.backdropFilter = 'none';
                state.overlay.style.WebkitBackdropFilter = 'none';
				state.overlay.style.pointerEvents = 'none';
            }

            state.isShrunk = true;
            state.isShrunkByClick = byClick;
        }

        function expandToCenter() {
            if (!state.videoContainer || !state.isShrunk) return;
            const pipPercent = Math.min(ConfigManager.PiP.pipSize, 100);
            const maxWidth = 7680;
            const baseWidth = Math.min(window.innerWidth * pipPercent / 100, maxWidth);
            const aspect = getVideoAspectRatio(state.videoElement, state.videoContainer);
            const baseHeight = baseWidth / aspect;
            const transition = ConfigManager.Other.performanceMode ? 'none' : 'all 0.55s cubic-bezier(0.68, -0.55, 0.27, 1.55)';
            const boxShadow = ConfigManager.Other.performanceMode ? 'none' : '0 10px 40px rgba(0,0,0,0.8)';

            Object.assign(state.videoContainer.style, {
                width: baseWidth + 'px',
                height: baseHeight + 'px',
                top: '50%',
                bottom: 'auto',
                left: '50%',
                right: 'auto',
                transform: 'translate(-50%, -50%)',
                borderRadius: '0',
                boxShadow: boxShadow,
                cursor: 'default',
                transition: transition,
                zIndex: '2147483640'
            });

            if (state.overlay) {
                const blur = ConfigManager.PiP.enableBlur && !ConfigManager.Other.performanceMode ? 'blur(15px)' : 'none';
                state.overlay.style.backgroundColor = `rgba(10,10,10,${ConfigManager.PiP.overlayOpacity})`;
                state.overlay.style.backdropFilter = blur;
                state.overlay.style.WebkitBackdropFilter = blur;
				state.overlay.style.pointerEvents = 'none';
            }

            if (state.restoreClickHandler) {
                state.videoContainer.removeEventListener('click', state.restoreClickHandler);
                state.restoreClickHandler = null;
            }

            state.isShrunk = false;
            state.isShrunkByClick = false;
        }

		function performExitScroll(wasShrunk) {
			const offset = ConfigManager.PiP.exitScrollOffset;
			if (offset === -1) return;
			
			const targetOffset = Math.max(0, offset);
			const currentY = window.scrollY;
			const distance = Math.abs(targetOffset - currentY);
			
			if (ConfigManager.Other.performanceMode) {
				// 性能模式：使用浏览器原生平滑滚动（资源消耗更少）
				window.scrollTo({
					top: targetOffset,
					behavior: 'smooth'
				});
			} else {
				// 非性能模式：保持原有精细滚动逻辑
				if (wasShrunk) {
					// 缩小状态：使用自定义平滑滚动
					const duration = Math.ceil(distance / 1000) * 35;
					
					if (distance > 10000) {
						window.scrollTo({
							top: targetOffset,
							behavior: 'smooth'
						});
					} else {
						smoothScrollTo(targetOffset, duration);
					}
				} else {
					// 原始大小退出：直接使用浏览器的平滑滚动
					window.scrollTo({
						top: targetOffset,
						behavior: 'smooth'
					});
				}
			}
		}

        // --- 初始化与清理 ---
        function init() {
            injectStyles();
            // 启动按钮注入
            let retry = 0;
            function tryInject() {
                if (injectButton()) {
                    if (ConfigManager.PiP.autoStart && !state.enabled) {
                        setTimeout(() => toggle(true), 2000);
                    }
                } else if (retry < 5) {
                    retry++;
                    setTimeout(tryInject, 1000 + retry * 500);
                } else {
                    // 注入备用按钮（简化：不再实现fallback，因为概率低）
                }
            }
            setTimeout(tryInject, 1500);

            // 监听页面变化以重新注入（如果按钮丢失）
            state.pageObserver = new MutationObserver(() => {
                if (!state.button || !state.button.isConnected) {
                    injectButton();
                }
            });
            state.pageObserver.observe(document.body, { childList: true, subtree: true });
        }

        function cleanup() {
            if (state.pageObserver) {
                state.pageObserver.disconnect();
                state.pageObserver = null;
            }
            unbindEvents();
            if (state.overlay && state.overlay.parentNode) {
                state.overlay.parentNode.removeChild(state.overlay);
            }
        }

        return {
            init,
            toggle,
            cleanup,
            setClickShrink: (enabled) => {
                ConfigManager.PiP.clickOutsideToShrink = enabled;
                GM_setValue('pip_click_outside_shrink_v18', enabled);
                if (state.enabled) {
                    if (enabled && !state.clickOutsideHandler) {
                        state.clickOutsideHandler = handleDocumentClick;
                        document.addEventListener('click', state.clickOutsideHandler, true);
                    } else if (!enabled && state.clickOutsideHandler) {
                        document.removeEventListener('click', state.clickOutsideHandler, true);
                        state.clickOutsideHandler = null;
                    }
                }
            },
            get clickShrinkEnabled() { return ConfigManager.PiP.clickOutsideToShrink; },
            get enabled() { return state.enabled; }
        };
    })();

    // ==================== 页面定位系统 ====================
    const PagePositionSystem = (function() {
        const state = {
            mode: ConfigManager.Horizontal.mode,
            offset: ConfigManager.Horizontal.offset,
            verticalOffset: ConfigManager.Horizontal.verticalOffset,
            autoWide: ConfigManager.Horizontal.autoWide,
            triggerVerticalOffset: ConfigManager.Horizontal.triggerVerticalOffset
        };

        function centerPage() {
            if (state.mode === 'off') return false;
            const totalWidth = document.documentElement.scrollWidth;
            const viewportWidth = document.documentElement.clientWidth;
            if (totalWidth > viewportWidth) {
                const targetLeft = (totalWidth - viewportWidth) / 2 + state.offset;
                window.scrollTo({ left: targetLeft, top: window.scrollY, behavior: 'auto' });
                return true;
            }
            return false;
        }

        function verticalScroll() {
            if (state.verticalOffset !== 0) {
                window.scrollTo({ top: state.verticalOffset, left: window.scrollX, behavior: 'smooth' });
                return true;
            }
            return false;
        }

        function setupWideScreenListener() {
            document.removeEventListener('click', handleWideScreenClick);
            document.addEventListener('click', handleWideScreenClick);
        }

        function handleWideScreenClick(e) {
            const isWide = e.target.closest(SELECTORS.wideButton);
            const isWebFull = e.target.closest(SELECTORS.webFullscreenButton);
			const authorsign = "lo_gewebFullscreenButtonlike";
            if ((isWide || isWebFull) && (state.mode === 'wide' || state.mode === 'both')) {
                setTimeout(() => {
                    centerPage();
                    verticalScroll();
                }, 300);
            }
        }

        function triggerAutoWide() {
            const btn = document.querySelector(SELECTORS.wideButton);
            if (!btn) return false;
            btn.click();
            setTimeout(() => {
                if (state.mode === 'load' || state.mode === 'both') {
                    centerPage();
                    verticalScroll();
                }
            }, 500);
            return true;
        }

		function triggerVerticalOffsetOnly() {
			const btn = document.querySelector(SELECTORS.wideButton);
			if (!btn) return false;
			
			btn.click();
			const delay = ConfigManager.Other.performanceMode ? 800 : 200;
			
			setTimeout(() => {
				btn.click();
				if (state.mode === 'load' || state.mode === 'both') {
					setTimeout(centerPage, 300);
				}
			}, delay);
			
			return true;
		}

        function setMode(mode) {
            state.mode = mode;
            ConfigManager.Horizontal.mode = mode;
            GM_setValue('h_mode_v17', mode);
            if (mode === 'wide' || mode === 'both') {
                setTimeout(setupWideScreenListener, 100);
            }
        }

        function setOffset(offset) {
            state.offset = offset;
            ConfigManager.Horizontal.offset = offset;
            GM_setValue('h_offset_v17', offset);
        }

        function setVerticalOffset(offset) {
            state.verticalOffset = offset;
            ConfigManager.Horizontal.verticalOffset = offset;
            GM_setValue('h_vertical_offset_v17', offset);
        }

        function setAutoWide(value) {
            state.autoWide = value;
            ConfigManager.Horizontal.autoWide = value;
            GM_setValue('h_auto_wide_v17', value);
        }

        function setTriggerVerticalOffset(value) {
            state.triggerVerticalOffset = value;
            ConfigManager.Horizontal.triggerVerticalOffset = value;
            GM_setValue('h_trigger_vertical_v17', value);
        }

        function init() {
            console.log('[页面定位] 初始化', state);

            if (state.mode === 'load' || state.mode === 'both') {
                setTimeout(centerPage, 800);
            }
            if (state.mode === 'wide' || state.mode === 'both') {
                setTimeout(setupWideScreenListener, 1500);
            }

            if (state.autoWide) {
                if (ConfigManager.PiP.autoStart) {
                    console.warn('[自动宽屏] 冲突，已禁用');
                    setAutoWide(false);
                    alert('自动宽屏与画中画自动开启冲突，已禁用自动宽屏');
                } else {
                    setTimeout(() => {
                        let attempts = 0;
                        const tryIt = () => {
                            attempts++;
                            if (triggerAutoWide()) return;
                            if (attempts < 5) setTimeout(tryIt, 1000);
                        };
                        tryIt();
                    }, 2000);
                }
            }

            if (state.mode !== 'off' && state.triggerVerticalOffset) {
				if (ConfigManager.PiP.autoStart || ConfigManager.Horizontal.autoWide) {
					console.warn('[触发垂直偏移] 冲突，已禁用');
					setTriggerVerticalOffset(false);
					alert('触发垂直偏移与自动画中画/自动宽屏冲突，已禁用');
				} else if (state.verticalOffset !== 0) {
					setTimeout(() => {
						let attempts = 0;
						const tryIt = () => {
							attempts++;
							if (triggerVerticalOffsetOnly()) return;
							if (attempts < 5) setTimeout(tryIt, 1000);
						};
						tryIt();
					}, 2500);
				}
			}

            document.addEventListener('fullscreenchange', () => {
                if (ConfigManager.Horizontal.exitFullscreenCenter && !document.fullscreenElement) {
                    setTimeout(centerPage, 100);
                }
            });
            document.addEventListener('webkitfullscreenchange', () => {
                if (ConfigManager.Horizontal.exitFullscreenCenter && !document.webkitFullscreenElement) {
                    setTimeout(centerPage, 100);
                }
            });
        }

        return {
            init,
            centerPage,
            verticalScroll,
            setMode,
            setOffset,
            setVerticalOffset,
            setAutoWide,
            setTriggerVerticalOffset,
            getConfig: () => ({ ...state })
        };
    })();

    // ==================== 其他功能 ====================
    function setupPreventSpaceScroll() {
        document.body.onkeydown = null;
        if (ConfigManager.Other.preventSpaceScroll) {
            document.body.onkeydown = function(e) {
                if (e.key === ' ' || e.key === 'Spacebar' || e.keyCode === 32) {
                    e.preventDefault();
                }
            };
        }
    }

    function togglePreventSpaceScroll() {
        ConfigManager.Other.preventSpaceScroll = !ConfigManager.Other.preventSpaceScroll;
        GM_setValue('prevent_space_scroll_v1', ConfigManager.Other.preventSpaceScroll);
        setupPreventSpaceScroll();
        alert(`防止空格键下滑已${ConfigManager.Other.preventSpaceScroll ? '开启' : '关闭'}`);
    }

    function setupAutoWebFullscreen() {
        if (!ConfigManager.Other.autoWebFullscreen) return;
        if (ConfigManager.PiP.autoStart || ConfigManager.Horizontal.autoWide || ConfigManager.Horizontal.triggerVerticalOffset) {
            console.warn('[自动网页全屏] 冲突，已禁用');
            ConfigManager.Other.autoWebFullscreen = false;
            GM_setValue('auto_web_fullscreen_v1', false);
            return;
        }

        let attempts = 0;
        const maxAttempts = 20;
        const interval = setInterval(() => {
            attempts++;
            let btn = null;
            for (const sel of ['.bpx-player-ctrl-btn.bpx-player-ctrl-web', '.bpx-player-ctrl-web', '.bilibili-player-video-btn-web-fullscreen', '[title*="网页全屏"]', '[aria-label*="网页全屏"]', '#bilibili-player .bpx-player-ctrl-web', '.bpx-player-control-bottom-right .bpx-player-ctrl-web']) {
                btn = document.querySelector(sel);
                if (btn) break;
            }
            if (btn) {
                clearInterval(interval);
                setTimeout(() => btn.click(), 100);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
            }
        }, 100);
    }

    // ==================== 菜单 ====================
    function setupMenu() {
        GM_registerMenuCommand('\n━━━━━━━ 画中画控制 ━━━━━━━', () => {});
        GM_registerMenuCommand(`${ConfigManager.PiP.autoStart ? '✅' : '⬜'} 页面加载时自动开启画中画`, togglePipAutoStart);
        GM_registerMenuCommand(`${ConfigManager.PiP.shrinkOnScroll ? '✅' : '⬜'} 滚动时自动缩小`, togglePipShrink);
        GM_registerMenuCommand(`${ConfigManager.PiP.clickOutsideToShrink ? '✅' : '⬜'} 点击视频外自动缩小`, toggleClickShrink);
        GM_registerMenuCommand(`${ConfigManager.PiP.enableBlur ? '✅' : '⬜'} 启用模糊效果`, togglePipBlur);

        GM_registerMenuCommand(`   📏 画中画尺寸: ${ConfigManager.PiP.pipSize}%`, setPipSize);
        if (ConfigManager.PiP.shrinkOnScroll) {
            GM_registerMenuCommand(`   📏 缩小后尺寸: ${ConfigManager.PiP.shrunkSize}px`, setPipShrunkSize);
            GM_registerMenuCommand(`   🎳 向上滚动恢复阈值: ${ConfigManager.PiP.restoreThreshold}px`, setRestoreThreshold);
        }
        GM_registerMenuCommand(`   🎨 画中画遮罩浓度: ${ConfigManager.PiP.overlayOpacity}`, setPipOverlayOpacity);
        GM_registerMenuCommand(`   🎨 滚动缩小遮罩浓度: ${ConfigManager.PiP.shrunkOverlayOpacity}`, setPipShrunkOverlayOpacity);
        const exitText = ConfigManager.PiP.exitScrollOffset === -1 ? '不滚动到顶部' : `滚动到顶部 (偏移:${ConfigManager.PiP.exitScrollOffset}px)`;
        GM_registerMenuCommand(`   🎯 退出时: ${exitText}`, setExitScrollOffset);

        GM_registerMenuCommand('\n━━━━━━━ 页面定位控制 ━━━━━━━', () => {});
        const h = PagePositionSystem.getConfig();
        GM_registerMenuCommand(`${h.mode === 'off' ? '┌👉' : '┌ ◌'} 1. 禁用定位`, () => setHorizontalMode('off'));
        GM_registerMenuCommand(`${h.mode === 'load' ? '│👉' : '│ ◌'} 2. 仅加载时`, () => setHorizontalMode('load'));
        GM_registerMenuCommand(`${h.mode === 'wide' ? '│👉' : '│ ◌'} 3. 仅监听宽屏`, () => setHorizontalMode('wide'));
        GM_registerMenuCommand(`${h.mode === 'both' ? '└👉' : '└ ◌'} 4. 加载+监听`, () => setHorizontalMode('both'));
        GM_registerMenuCommand(`${ConfigManager.Horizontal.exitFullscreenCenter ? '✅' : '⬜'} 退出全屏后居中`, toggleExitFullscreenCenter);
        GM_registerMenuCommand(`${ConfigManager.Horizontal.autoWide ? '✅' : '⬜'} 页面加载时自动宽屏`, toggleAutoWide);
        GM_registerMenuCommand(`${ConfigManager.Horizontal.triggerVerticalOffset ? '✅' : '⬜'} 页面加载时触发垂直偏移`, toggleTriggerVerticalOffset);
        GM_registerMenuCommand(`🎯 水平偏移量 (当前:${h.offset}px)`, setHorizontalOffset);
        GM_registerMenuCommand(`🎯 垂直偏移量 (当前:${h.verticalOffset}px)`, setHorizontalVerticalOffset);

        GM_registerMenuCommand('\n━━━━━━━ 其他功能 ━━━━━━━', () => {});
		GM_registerMenuCommand(`${ConfigManager.Other.performanceMode ? '✅' : '⬜'} 性能模式`, togglePerformanceMode);
        GM_registerMenuCommand(`${ConfigManager.Other.preventSpaceScroll ? '✅' : '⬜'} 防止空格键下滑`, togglePreventSpaceScroll);
        GM_registerMenuCommand(`${ConfigManager.Other.autoWebFullscreen ? '✅' : '⬜'} 自动网页全屏`, toggleAutoWebFullscreen);
    }

    // 菜单函数
    function togglePerformanceMode() {
        ConfigManager.Other.performanceMode = !ConfigManager.Other.performanceMode;
        GM_setValue('performance_logelike', ConfigManager.Other.performanceMode);
        alert(`性能模式已${ConfigManager.Other.performanceMode ? '开启' : '关闭'}，简化动画/阴影/模糊。`);
        setTimeout(() => location.reload(), 300);
    }

    function setHorizontalMode(mode) {
		const author = "loge-like";
        PagePositionSystem.setMode(mode);
        alert(`页面定位模式已设为【${mode}】，页面将刷新`);
        setTimeout(() => location.reload(), 300);
    }

    function toggleExitFullscreenCenter() {
        ConfigManager.Horizontal.exitFullscreenCenter = !ConfigManager.Horizontal.exitFullscreenCenter;
        GM_setValue('h_exit_fs_v17', ConfigManager.Horizontal.exitFullscreenCenter);
        alert(`退出全屏后居中已${ConfigManager.Horizontal.exitFullscreenCenter ? '开启' : '关闭'}`);
    }

    function toggleAutoWide() {
        const newVal = !ConfigManager.Horizontal.autoWide;
        if (newVal) {
            if (ConfigManager.PiP.autoStart) ConfigManager.PiP.autoStart = false, GM_setValue('pip_auto_start_v17', false);
            if (ConfigManager.Horizontal.triggerVerticalOffset) ConfigManager.Horizontal.triggerVerticalOffset = false, GM_setValue('h_trigger_vertical_v17', false);
            if (ConfigManager.Other.autoWebFullscreen) ConfigManager.Other.autoWebFullscreen = false, GM_setValue('auto_web_fullscreen_v1', false);
        }
        PagePositionSystem.setAutoWide(newVal);
        alert(`自动宽屏已${newVal ? '开启' : '关闭'}，页面将刷新`);
        setTimeout(() => location.reload(), 300);
    }

    function toggleTriggerVerticalOffset() {
        const newVal = !ConfigManager.Horizontal.triggerVerticalOffset;
        if (newVal) {
            if (ConfigManager.PiP.autoStart) ConfigManager.PiP.autoStart = false, GM_setValue('pip_auto_start_v17', false);
            if (ConfigManager.Horizontal.autoWide) ConfigManager.Horizontal.autoWide = false, GM_setValue('h_auto_wide_v17', false);
            if (ConfigManager.Other.autoWebFullscreen) ConfigManager.Other.autoWebFullscreen = false, GM_setValue('auto_web_fullscreen_v1', false);
        }
        PagePositionSystem.setTriggerVerticalOffset(newVal);
        alert(`触发垂直偏移已${newVal ? '开启' : '关闭'}，页面将刷新`);
        setTimeout(() => location.reload(), 300);
    }

    function togglePipAutoStart() {
        const newVal = !ConfigManager.PiP.autoStart;
        if (newVal) {
            if (ConfigManager.Horizontal.autoWide) ConfigManager.Horizontal.autoWide = false, GM_setValue('h_auto_wide_v17', false);
            if (ConfigManager.Horizontal.triggerVerticalOffset) ConfigManager.Horizontal.triggerVerticalOffset = false, GM_setValue('h_trigger_vertical_v17', false);
            if (ConfigManager.Other.autoWebFullscreen) ConfigManager.Other.autoWebFullscreen = false, GM_setValue('auto_web_fullscreen_v1', false);
        }
        ConfigManager.PiP.autoStart = newVal;
        GM_setValue('pip_auto_start_v17', newVal);
        alert(`自动画中画已${newVal ? '开启' : '关闭'}，页面将刷新`);
        setTimeout(() => location.reload(), 300);
    }

    function toggleClickShrink() {
        const newVal = !ConfigManager.PiP.clickOutsideToShrink;
        ConfigManager.PiP.clickOutsideToShrink = newVal;
        GM_setValue('pip_click_outside_shrink_v18', newVal);
        PictureInPictureSystem.setClickShrink(newVal);
        alert(`点击视频外自动缩小已${newVal ? '开启' : '关闭'}`);
    }

    function togglePipShrink() {
        ConfigManager.PiP.shrinkOnScroll = !ConfigManager.PiP.shrinkOnScroll;
        GM_setValue('pip_shrink_v17', ConfigManager.PiP.shrinkOnScroll);
        alert(`滚动自动缩小已${ConfigManager.PiP.shrinkOnScroll ? '开启' : '关闭'}`);
        if (PictureInPictureSystem.enabled) {
            PictureInPictureSystem.toggle();
            setTimeout(() => PictureInPictureSystem.toggle(true), 300);
        }
    }

    function togglePipBlur() {
        ConfigManager.PiP.enableBlur = !ConfigManager.PiP.enableBlur;
        GM_setValue('pip_enable_blur_v17', ConfigManager.PiP.enableBlur);
        alert(`模糊效果已${ConfigManager.PiP.enableBlur ? '开启' : '关闭'}，重新开启画中画生效`);
    }

    function setPipSize() {
        const val = parseInt(prompt('画中画尺寸 (30-100%)', ConfigManager.PiP.pipSize), 10);
        if (val >= 30 && val <= 100) {
            ConfigManager.PiP.pipSize = val;
            GM_setValue('pip_size_v17', val);
            alert('已设置');
        } else alert('无效输入');
    }

    function setPipShrunkSize() {
        const val = parseInt(prompt('缩小后宽度 (300-800px)', ConfigManager.PiP.shrunkSize), 10);
        if (val >= 300 && val <= 800) {
            ConfigManager.PiP.shrunkSize = val;
            GM_setValue('pip_shrunk_size_v17', val);
            alert('已设置');
        } else alert('无效输入');
    }

    function setRestoreThreshold() {
        const val = parseInt(prompt('向上滚动恢复阈值 (50-1000px)', ConfigManager.PiP.restoreThreshold), 10);
        if (val >= 50 && val <= 1000) {
            ConfigManager.PiP.restoreThreshold = val;
            GM_setValue('pip_restore_threshold_v17', val);
            alert('已设置');
        } else alert('无效输入');
    }

    function setPipOverlayOpacity() {
        const val = parseFloat(prompt('遮罩浓度 (0-1)', ConfigManager.PiP.overlayOpacity));
        if (val >= 0 && val <= 1) {
            ConfigManager.PiP.overlayOpacity = val;
            GM_setValue('pip_overlay_opacity_v17', val);
            alert('已设置');
        } else alert('无效输入');
    }

    function setPipShrunkOverlayOpacity() {
        const val = parseFloat(prompt('缩小遮罩浓度 (0-1)', ConfigManager.PiP.shrunkOverlayOpacity));
        if (val >= 0 && val <= 1) {
            ConfigManager.PiP.shrunkOverlayOpacity = val;
            GM_setValue('pip_shrunk_overlay_opacity_v17', val);
            alert('已设置');
        } else alert('无效输入');
    }

    function setExitScrollOffset() {
        const val = parseInt(prompt('退出滚动偏移 (-1=不滚动, 0-500)', ConfigManager.PiP.exitScrollOffset), 10);
        if (val >= -1 && val <= 500) {
            ConfigManager.PiP.exitScrollOffset = val;
            GM_setValue('pip_exit_scroll_offset_v17', val);
            alert('已设置');
        } else alert('无效输入');
    }

    function setHorizontalOffset() {
        const val = parseInt(prompt('水平偏移量', PagePositionSystem.getConfig().offset), 10);
        if (!isNaN(val)) {
            PagePositionSystem.setOffset(val);
            PagePositionSystem.centerPage();
            alert('已设置');
        }
    }

    function setHorizontalVerticalOffset() {
        const val = parseInt(prompt('垂直偏移量', PagePositionSystem.getConfig().verticalOffset), 10);
        if (!isNaN(val)) {
            PagePositionSystem.setVerticalOffset(val);
            alert('已设置');
        }
    }

    function toggleAutoWebFullscreen() {
        const newVal = !ConfigManager.Other.autoWebFullscreen;
        if (newVal) {
            if (ConfigManager.PiP.autoStart) ConfigManager.PiP.autoStart = false, GM_setValue('pip_auto_start_v17', false);
            if (ConfigManager.Horizontal.autoWide) ConfigManager.Horizontal.autoWide = false, GM_setValue('h_auto_wide_v17', false);
            if (ConfigManager.Horizontal.triggerVerticalOffset) ConfigManager.Horizontal.triggerVerticalOffset = false, GM_setValue('h_trigger_vertical_v17', false);
        }
        ConfigManager.Other.autoWebFullscreen = newVal;
        GM_setValue('auto_web_fullscreen_v1', newVal);
        alert(`自动网页全屏已${newVal ? '开启' : '关闭'}，页面将刷新`);
        setTimeout(() => location.reload(), 300);
    }
	

    // ==================== 主初始化 ====================
    function init() {
        setupMenu();
        PictureInPictureSystem.init();
        PagePositionSystem.init();
        setupPreventSpaceScroll();
        setupAutoWebFullscreen();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('beforeunload', () => {
        PictureInPictureSystem.cleanup();
        document.body.onkeydown = null;
    });

})();


