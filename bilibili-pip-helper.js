// ==UserScript==
// @name         哔哩哔哩视频浮窗定位助手
// @homepageURL   https://github.com/Loge-Like/bilibili-pip-helper
// @supportURL    https://github.com/Loge-Like/bilibili-pip-helper/issues
// @namespace    http://tampermonkey.net/
// @version      2.01
// @description  页面画中画悬浮播放，更沉浸的体验；页面智能定位，告别浏览器放大后的手动拖拽滚动条。优化B站观影体验。
// @author       萝哥-like
// @copyright    https://github.com/Loge-Like
// @license      MIT
// @icon         http://bilibili.com/favicon.ico
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/list/*
// @match        *://www.bilibili.com/medialist/play/*
// @match        *://www.bilibili.com/playlist/*
// @match        *://www.bilibili.com/bangumi/play/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @downloadURL  https://update.greasyfork.org/scripts/566502/%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E8%A7%86%E9%A2%91%E6%B5%AE%E7%AA%97%E5%AE%9A%E4%BD%8D%E5%8A%A9%E6%89%8B.user.js
// @updateURL    https://update.greasyfork.org/scripts/566502/%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E8%A7%86%E9%A2%91%E6%B5%AE%E7%AA%97%E5%AE%9A%E4%BD%8D%E5%8A%A9%E6%89%8B.meta.js
// ==/UserScript==


(function() {

    'use strict';

// ==== 常量与工具函数 ====
    const SELECTORS = {
        videoContainer: '.bpx-player-container, .bilibili-player-video',
        videoElement: '.bpx-player-video-wrap video',
        sendingBar: '.bpx-player-sending-bar, .bpx-player-video-sending',
        wideButton: '.bpx-player-ctrl-wide, .bilibili-player-video-btn-wide',
        webFullscreenButton: '.bpx-player-ctrl-web, .bpx-player-ctrl-web-fullscreen, [title*="网页全屏"], [aria-label*="网页全屏"]',
        fallbackContainer: '.bpx-player-docker, .player-wrap, #bofqi, .bpx-player-video-wrap',
		backgroundContent: '.video-container-v1, .main-container, .home-container, .page-bg-screen, .page-festival-bg-main, .page-festival-bg, #app'
    };
	
	const globalState = {
		isUrlChange: false,
	};
	
    // # 工具函数：平滑滚动 #
    function smoothScrollTo(targetY, duration) {
		const startY = window.scrollY;
		const distance = targetY - startY;
		const startTime = performance.now();
		
		function step(currentTime) {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);
			
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

    // # 工具函数：获取视频宽高比 #
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
	
	// # 工具函数：获取背景颜色 #
	function getBackgroundColor() {
		const bodyBg = window.getComputedStyle(document.body).backgroundColor;
		
		if (bodyBg.startsWith('rgb(')) {
			return bodyBg.slice(4, -1);
		} else if (bodyBg.startsWith('rgba(')) {
			const match = bodyBg.match(/rgba?\((\d+,\s*\d+,\s*\d+)/);
			return match ? match[1] : '28, 28, 35';
		} else if (bodyBg === 'rgba(0, 0, 0, 0)') {
			return '28, 28, 35';
		}
		
		return '28, 28, 35';
	}
	
	// # 工具函数：获取带透明度的遮罩颜色 #
	function getOverlayColor(baseOpacity) {
		const mode = ConfigManager.PiP.overlayMode;
		const opacity = baseOpacity !== undefined ? baseOpacity : ConfigManager.PiP.overlayOpacity;
		
		if (mode === 'adaptive') {
			const bgColor = getBackgroundColor();
			return `rgba(${bgColor}, ${opacity})`;
		} else if (mode === 'black') {
			return `rgba(10, 10, 10, ${opacity})`;
		}
		
		return `rgba(10, 10, 10, ${opacity})`;
	}
	
	function isExcludedPage() {
		const url = window.location.href;
		const excludePaths = [
			/* '/festival/',
			'/activity/', 
			'/v/activity', */
			'/bangumi/',
		];
		
		for (const path of excludePaths) {
			if (url.includes(path)) return true;
		}
	}

    // === 配置管理器 ===
    const ConfigManager = {
        Horizontal: {
            loadHorizontalEnabled: GM_getValue('load_horizontal_enabled', false),
			loadVerticalEnabled: GM_getValue('load_vertical_enabled', false),
			wideHorizontalEnabled: GM_getValue('wide_horizontal_enabled', true),
			wideVerticalEnabled: GM_getValue('wide_vertical_enabled', true),
			fullscreenHorizontalEnabled: GM_getValue('fullscreen_horizontal_enabled', false),
			fullscreenVerticalEnabled: GM_getValue('fullscreen_vertical_enabled', false),
            offset: GM_getValue('h_offset', 8),
			verticalOffset: GM_getValue('h_vertical_offset', 0),
			videoTopOffset: GM_getValue('h_video_top_offset', false),  	
        },

        PiP: {
			pipSize: GM_getValue('pip_size', 80),
            shrunkSize: GM_getValue('pip_shrunk_size', 400),
			overlayMode: GM_getValue('pip_overlay_mode', 'black'),
            overlayOpacity: GM_getValue('pip_overlay_opacity', 0.8),
            shrunkOverlayOpacity: GM_getValue('pip_shrunk_overlay_opacity', 0.4),
            blurMode: GM_getValue('pip_blur_mode', 'none'),
			blurStrength: GM_getValue('pip_blur_strength', 15),
			effectMode: GM_getValue('pip_effect_mode', 'none'),
			useCoverForBlur: GM_getValue('pip_use_cover_for_blur', false),
			particleCount: GM_getValue('pip_particle_count', 'medium'),
			dynamicParticleCount: GM_getValue('dynamic_particle_count', true),
			effectGlobalOpacity: GM_getValue('pip_effect_opacity', 1),
			effectLayer: GM_getValue('pip_effect_layer', false),
			frameRate: GM_getValue('pip_frame_rate', 60),
			speedCompensation: GM_getValue('pip_frameRate_speedCompensation', true),
			author: GM_getValue('log_e_like', 0),
            shrinkOnScrollDown: GM_getValue('pip_shrink_down_enabled', false),
			shrinkDownDistance: GM_getValue('pip_shrink_down_distance', 50),
			restoreOnScrollUp: GM_getValue('pip_restore_up_enabled', false),
			restoreUpDistance: GM_getValue('pip_restore_up_distance', 600), 
            clickOutsideToShrink: GM_getValue('pip_click_outside_shrink', false),
			pipHorizontalEnabled: GM_getValue('pip_horizontal_enabled', false),
			pipVerticalEnabled: GM_getValue('pip_vertical_enabled', true),
        },
		
		Auto: {
			loadAction: GM_getValue('auto_load_action', 'none'),
			playEnterFullscreen: GM_getValue('play_enter_fullscreen', false),
			pauseExitFullscreen: GM_getValue('pause_exit_fullscreen', false),
			pipEnterFullscreen: GM_getValue('pip_enter_fullscreen', false),
			pipExitFullscreen: GM_getValue('pip_exit_fullscreen', false),
			pipEnterAutoPlay: GM_getValue('pip_enter_autoplay', false),
			pipExitAutoPause: GM_getValue('pip_exit_autopause', false),
		},

        Other: {
			performanceMode: GM_getValue('performance_logelike', false),
            preventSpaceScroll: GM_getValue('prevent_space_scroll', false),
			showPipButton: GM_getValue('show_pip_button', true),
			showSizeButton: GM_getValue('show_size_button', true),
			showPipContainerCloseButton: GM_getValue('show_container_close_button', true),
			sizeButtonMode: GM_getValue('size_button_mode', 'temporary'),
			scrollbarHideMode: GM_getValue('scrollbar_hide_mode', 'none'),
        }
    };
	
	// === 默认配置（用于重置） ===
	const DEFAULT_CONFIG = {
		Horizontal: {
			loadHorizontalEnabled: false,
			loadVerticalEnabled: false,
			wideHorizontalEnabled: true,
			wideVerticalEnabled: true,
			fullscreenHorizontalEnabled: false,
			fullscreenVerticalEnabled: false,
			offset: 8,
			verticalOffset: 0,
			videoTopOffset: false,
		},
		PiP: {
			pipSize: 80,
			shrunkSize: 400,
			overlayMode: 'black',
			overlayOpacity: 0.8,
			shrunkOverlayOpacity: 0.4,
			blurMode: 'none',
			blurStrength: 15,
			effectMode: 'none',
			useCoverForBlur: false,
			particleCount: 'medium',
			dynamicParticleCount: true,
			effectGlobalOpacity: 1,
			effectLayer: false,
			frameRate: 60,
			speedCompensation: true,
			shrinkOnScrollDown: false,
			shrinkDownDistance: 50,
			restoreOnScrollUp: false,
			restoreUpDistance: 600,
			clickOutsideToShrink: false,
			pipHorizontalEnabled: false,
			pipVerticalEnabled: true,
		},
		Auto: {
			loadAction: 'none',
			playEnterFullscreen: false,
			pauseExitFullscreen: false,
			pipEnterFullscreen: false,
			pipExitFullscreen: false,
			pipEnterAutoPlay: false,
			pipExitAutoPause: false,
		},
		Other: {
			performanceMode: false,
			preventSpaceScroll: false,
			showPipButton: true,
			showSizeButton: true,
			showPipContainerCloseButton: true,
			sizeButtonMode: 'temporary',
			scrollbarHideMode: 'none',
		}
	};

	// === 可视化面板 ===
	// -- 配置保存函数 --
	function setConfigValue(module, key, value) {
		if (!ConfigManager[module]) {
			console.error(`[配置] 未知模块: ${module}`);
			return;
		}
		
		ConfigManager[module][key] = value;
		
		let storageKey = '';
		switch(module) {
			case 'Horizontal':
				switch(key) {
					case 'loadHorizontalEnabled': storageKey = 'load_horizontal_enabled'; break;
					case 'loadVerticalEnabled': storageKey = 'load_vertical_enabled'; break;
					case 'wideHorizontalEnabled': storageKey = 'wide_horizontal_enabled'; break;
					case 'wideVerticalEnabled': storageKey = 'wide_vertical_enabled'; break;
					case 'fullscreenHorizontalEnabled': storageKey = 'fullscreen_horizontal_enabled'; break;
					case 'fullscreenVerticalEnabled': storageKey = 'fullscreen_vertical_enabled'; break;
					case 'offset': storageKey = 'h_offset'; break;
					case 'verticalOffset': storageKey = 'h_vertical_offset'; break;
					case 'videoTopOffset': storageKey = 'h_video_top_offset'; break;	
				}
				break;
				
			case 'PiP':
				switch(key) {
					case 'pipSize': storageKey = 'pip_size'; break;
					case 'shrunkSize': storageKey = 'pip_shrunk_size'; break;
					case 'overlayMode': storageKey = 'pip_overlay_mode'; break;
					case 'overlayOpacity': storageKey = 'pip_overlay_opacity'; break;
					case 'shrunkOverlayOpacity': storageKey = 'pip_shrunk_overlay_opacity'; break;
					case 'blurMode': storageKey = 'pip_blur_mode'; break;
					case 'blurStrength': storageKey = 'pip_blur_strength'; break;
					case 'effectMode': storageKey = 'pip_effect_mode'; break;
					case 'useCoverForBlur': storageKey = 'pip_use_cover_for_blur'; break;
					case 'particleCount': storageKey = 'pip_particle_count'; break;
					case 'dynamicParticleCount': storageKey = 'dynamic_particle_count'; break;
					case 'effectGlobalOpacity': storageKey = 'pip_effect_opacity'; break;
					case 'effectLayer': storageKey = 'pip_effect_layer'; break;
					case 'frameRate': storageKey = 'pip_frame_rate'; break;
					case 'speedCompensation': storageKey = 'pip_frameRate_speedCompensation'; break;
					case 'shrinkOnScrollDown': storageKey = 'pip_shrink_down_enabled'; break;
					case 'shrinkDownDistance': storageKey = 'pip_shrink_down_distance'; break;
					case 'restoreOnScrollUp': storageKey = 'pip_restore_up_enabled'; break;
					case 'restoreUpDistance': storageKey = 'pip_restore_up_distance'; break;
					case 'clickOutsideToShrink': storageKey = 'pip_click_outside_shrink'; break;
					case 'pipHorizontalEnabled': storageKey = 'pip_horizontal_enabled'; break;
					case 'pipVerticalEnabled': storageKey = 'pip_vertical_enabled'; break;
				}
				break;
				
			case 'Auto':
				switch(key) {
					case 'loadAction': storageKey = 'auto_load_action'; break;
					case 'playEnterFullscreen': storageKey = 'play_enter_fullscreen'; break;
					case 'pauseExitFullscreen': storageKey = 'pause_exit_fullscreen'; break;
					case 'pipEnterFullscreen': storageKey = 'pip_enter_fullscreen'; break;
					case 'pipExitFullscreen': storageKey = 'pip_exit_fullscreen'; break;
					case 'pipEnterAutoPlay': storageKey = 'pip_enter_autoplay'; break;
					case 'pipExitAutoPause': storageKey = 'pip_exit_autopause'; break;
				}
				break;
				
			case 'Other':
				switch(key) {
					case 'performanceMode': storageKey = 'performance_logelike'; break;
					case 'preventSpaceScroll': storageKey = 'prevent_space_scroll'; break;
					case 'showPipButton': storageKey = 'show_pip_button'; break;
					case 'showSizeButton': storageKey = 'show_size_button'; break;
					case 'showPipContainerCloseButton': storageKey = 'show_container_close_button'; break;
					case 'sizeButtonMode': storageKey = 'size_button_mode'; break;
					case 'scrollbarHideMode': storageKey = 'scrollbar_hide_mode'; break;
				}
				break;
				
			default:
				console.error(`[配置] 未知模块: ${module}`); return;
		}
		
		GM_setValue(storageKey, value);
		console.log(`[配置] 已保存: ${module}.${key} = ${value} (${storageKey})`);
	}

	// -- 面板样式 --
	function injectPanelStyles() {
		GM_addStyle(`
			
			/* 面板容器 */
			#bili-pip-panel {
				position: fixed;
				top: 50%;
				left: 50%;
				transform: translate(-50%, -50%);
				width: 800px;
				max-width: 90vw;
				height: 700px;
				max-height: 95vh;
				border-radius: 16px;
				box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
				z-index: 2147483647;
				display: none;
				flex-direction: column;
				border: 1px solid rgba(255, 255, 255, 0.15);
			}

			#bili-pip-panel.show {
				display: flex;
			}
			
			#bili-pip-panel > div:last-child {
				display: flex;
				min-height: 0;
				flex: 1;
				height: calc(100% - 40px);
				padding-bottom: 50px;
			}
			
			/* 面板头部 */
			#bili-pip-panel .panel-header {
				height: 40px;
				flex-shrink: 0;
				display: flex;
				justify-content: space-between;
				align-items: center;
				padding: 16px 20px;
			}

			#bili-pip-panel .panel-header h3 {
				margin: 0;
				font-size: 21px;
				font-weight: 400;
				color: #00aeec;
			}

			#bili-pip-panel .close-btn {
				background: none;
				border: none;
				color: #aaa;
				font-size: 20px;
				cursor: pointer;
				padding: 0 8px;
				line-height: 1;
				transition: color 0.2s;
			}

			#bili-pip-panel .close-btn:hover {
				color: white;
			}
			
			/* 标签栏 */
			.panel-tabs {
				width: 140px;
				padding: 14px 0;
				display: flex;
				flex-direction: column;
				gap: 4px;
				position: relative;
				height: 100%;
			}
			
			.panel-tabs::after {
				content: '';
				position: absolute;
				right: 0;
				top: 3%;
				width: 1px;
				height: 90%;
				background: linear-gradient(
					to bottom,
					rgba(150, 150, 150, 0.5) 0%,
					rgba(150, 150, 150, 0.1) 70%,
					transparent 100%
				);
				pointer-events: none;
			}
			
			.panel-tab {
				padding: 12px 16px;
				margin: 0 8px;
				border-radius: 6px;
				font-size: 14px;
				color: inherit;
				opacity: 0.6;
				cursor: pointer;
				transition: all 0.2s ease;
				white-space: nowrap;
				border-left: 3px solid transparent;
				text-align: center;
			} 
			
			.panel-tab:hover {
				opacity: 0.9;
				background: rgba(255, 255, 255, 0.1);
			}
			
			.panel-tab.active {
				opacity: 1;
				background: rgba(0, 174, 236, 0.15);
				border-left-color: #00aeec;
				font-weight: 500;
			}
			
			/* 内容区域 */
			.panel-content {
				flex: 1;
				padding: 14px 22px;
				height: 100%;
				min-width: 0;
				scrollbar-width: thin;
			}
			
			.page-container {
				display: none;
				height: 100%;
			}
			
			.page-container.active {
				display: block;
			}
			
			.page-container .section {
				height: auto;
				min-height: 100%;
			}
			
			/* 隐藏面板滚动条 */
			#bili-pip-panel .panel-content {
				scrollbar-width: none !important;
				-ms-overflow-style: none !important;
				overflow-y: auto !important;
			}
			
			#bili-pip-panel .panel-content::-webkit-scrollbar {
				display: none !important;
				width: 0 !important;
				height: 0 !important;
				background: transparent !important;
				-webkit-appearance: none !important;
			}
			
			#bili-pip-panel .page-container {
				scrollbar-width: none !important;
				-ms-overflow-style: none !important;
			}
			
			#bili-pip-panel .page-container::-webkit-scrollbar {
				display: none !important;
			}

			/* 面板遮罩 */
			#bili-pip-mask {
				position: fixed;
				top: 0;
				left: 0;
				width: 100vw;
				height: 100vh;
				background-color: rgba(0, 0, 0, 0.6);
				z-index: 2147483646;
				display: none;
			}

			#bili-pip-mask.show {
				display: block;
			}

			/* 配置区块 */
			#bili-pip-panel .section {
				margin-bottom: 32px !important;
				padding-bottom: 16px !important;
				border-bottom: 2px solid rgba(255, 255, 255, 0.5) !important;
			}
			
			#bili-pip-panel .section:last-child {
				border-bottom: none !important;
				margin-bottom: 0 !important;
				padding-bottom: 0 !important;
			}

			#bili-pip-panel .section-title {
				margin: 0 0 30px 0;
				font-size: 18px;
				font-weight: 330;
				color: #00aeec;
				border-left: 3px solid #00aeec;
				padding-left: 12px;
				letter-spacing: 0.5px;
			}
			
			.section-title {
				position: relative;
				display: flex;
				justify-content: space-between;
				align-items: center;
			}
			
			.section-title .reset-btn {
				font-size: 11px;
				padding: 10px 6px 0 6px;
				background: transparent !important;
				border: 0 !important;
				color: #999999;
				opacity: 0.5;
				cursor: pointer;
				transition: all 0.2s;
			}
			
			.section-title .reset-btn:hover {
				opacity: 1;
			}

			/* 设置项 */
			#bili-pip-panel .setting-item {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 12px;
				padding: 4px 0;
			}

			#bili-pip-panel .setting-label {
				font-size: 14px;
				color: inherit;
				opacity: 0.9;
			}

			/* 复选框样式 */
			#bili-pip-panel input[type="checkbox"] {
				width: 18px;
				height: 18px;
				cursor: pointer;
				accent-color: #00aeec;
			}

			/* 数字输入框 */
			#bili-pip-panel input[type="number"] {
				width: 40px;
				padding: 6px 8px 6px 20px;
				background: rgba(255, 255, 255, 0.9);
				border: 1px solid rgba(0, 0, 0, 0.2);
				border-radius: 6px;
				color: #333333;
				font-size: 13px;
				text-align: center;
				transition: border-color 0.2s;
			}

			#bili-pip-panel input[type="number"]:focus {
				outline: none;
				border-color: #00aeec;
			}

			/* 滑块输入 */
			#bili-pip-panel input[type="range"] {
				width: 120px;
				height: 4px;
				background: rgba(255, 255, 255, 0.2);
				border-radius: 2px;
				-webkit-appearance: none;
			}

			#bili-pip-panel input[type="range"]::-webkit-slider-thumb {
				-webkit-appearance: none;
				width: 16px;
				height: 16px;
				background: #00aeec;
				border-radius: 50%;
				cursor: pointer;
				transition: transform 0.2s;
			}

			#bili-pip-panel input[type="range"]::-webkit-slider-thumb:hover {
				transform: scale(1.2);
			}

			/* 单选按钮组 */
			#bili-pip-panel .radio-group {
				display: flex;
				gap: 8px;
				flex-wrap: wrap;
			}

			#bili-pip-panel .radio-group label {
				display: flex;
				align-items: center;
				gap: 4px;
				font-size: 13px;
				color: inherit;
				opacity: 0.9;
				cursor: pointer;
			}

			#bili-pip-panel input[type="radio"] {
				accent-color: #00aeec;
				margin: 0;
			}

			/* 按钮 */
			#bili-pip-panel .btn {
				padding: 6px 12px;
				background: #00aeec;
				color: white;
				border: none;
				border-radius: 6px;
				font-size: 13px;
				cursor: pointer;
				transition: background 0.2s;
			}

			#bili-pip-panel .btn:hover {
				background: #0096d6;
			}

			#bili-pip-panel .btn.small {
				padding: 4px 8px;
				font-size: 12px;
			}
			
			.btn.small {
				padding: 4px 8px;
				font-size: 12px;
				background: #f0f0f0;
				color: #333;
				border: 1px solid #ddd;
			}
			
			.btn.small:hover {
				background: #e0e0e0;
			}

			/* 分隔线 */
			.divider-light {
				height: 1px !important;
				background: transparent !important;
				border-top: 1px solid rgba(220, 220, 220, 0.65) !important;
				margin: 20px auto !important;
				width: 90% !important;
			}
			
			.divider-space {
				height: 1px !important;
				background: transparent !important;
				margin: 10px auto !important;
				width: 100% !important;
			}

			/* 提示文字 */
			#bili-pip-panel .hint {
				font-size: 11px;
				color: #999999;
				opacity: 0.6;
				margin-top: 4px;
			}
			
			#bili-pip-panel .setting-item .hint {
				margin: 0;
				color: #999999; 
			}

			/* 值显示 */
			#bili-pip-panel .value-display {
				min-width: 40px;
				text-align: right;
				font-size: 13px;
				color: #00aeec;
			}
			
			/* FAQ */
			.faq-item {
				padding-bottom: 30px;
			}

			.faq-question {
				font-weight: 600;
				color: #00aeec;
				margin-bottom: 6px;
				font-size: 15px;
				display: flex;
				align-items: center;
				gap: 6px;
			}

			.faq-answer {
				padding-left: 24px;
				padding-right: 48px;
				font-size: 13px;
				line-height: 1.6;
				opacity: 0.9;
				color: inherit;
				background: none;
				border-left: none;
			}
		`);
	}

	// -- 创建面板 --
	function createPanel() {
		const bgColorStr = getBackgroundColor();
		const rgb = bgColorStr.split(',').map(Number);
		const brightness = (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722);
		const textColor = brightness < 128 ? '#e0e0e0' : '#333333';
		
		const newPanel = document.createElement('div');
		newPanel.id = 'bili-pip-panel';
		newPanel.style.backgroundColor = `rgb(${bgColorStr})`;
		newPanel.style.color = textColor;
		
		if (ConfigManager.Other.performanceMode) {
			newPanel.classList.add('performance-mode');
		}
		
		newPanel.innerHTML = `
		
			<div class="panel-header">
				<h3>⚙️ 哔哩哔哩浮窗定位助手</h3>
				<div style="display: flex; gap: 15px;  align-items: center;">
					<a href="https://github.com/Loge-Like/bilibili-pip-helper" target="_blank" style="color: inherit; text-decoration: none; font-size: 14px; font-weight: 200; display: flex; align-items: center; gap: 4px; margin-top: 5px;">
						<span style="font-size: 14px;"></span> GitHub 主页
					</a>
					<button class="close-btn">✕</button>
				</div>
			</div>
			
			<div style="display: flex; min-height: 0;">
				<!-- 左侧标签栏 -->
				<div class="panel-tabs">
					<div class="panel-tab active" data-page="position">🎯 页面定位</div>
					<div class="panel-tab" data-page="pip">📺 画中画</div>
					<div class="panel-tab" data-page="effect">✨ 动态特效</div>
					<div class="panel-tab" data-page="auto">⏱️ 自动化</div>
					<div class="panel-tab" data-page="other">🛠️ 杂　项</div>
					<div class="panel-tab" data-page="ad">💃 性感广告</div>
					<div class="panel-tab" data-page="help">💡 帮　助</div>
				</div>
				
				<!-- 右侧内容区 -->
				<div class="panel-content">
					<!-- 页面定位页 -->
					<div class="page-container active" id="page-position">
						<div class="section">
							<div class="section-title">页面定位</div>
							
							<!-- 表格形式的触发场景配置 -->
							<div style="display: grid; grid-template-columns: 1fr 80px 80px; gap: 10px; align-items: center; margin-bottom: 15px; padding: 0 4px;">
								<div style="font-weight: 500; color: #00aeec;">触发场景</div>
								<div style="font-weight: 500; color: #00aeec; text-align: center;">水平居中</div>
								<div style="font-weight: 500; color: #00aeec; text-align: center;">垂直偏移</div>
							</div>
							
							<div style="display: grid; grid-template-columns: 1fr 80px 80px; gap: 10px; align-items: center; margin-bottom: 12px; padding: 0 4px;">
								<div style="opacity: 0.9; font-size: 13px;">页面加载时</div>
								<div style="text-align: center;">
									<input type="checkbox" data-module="Horizontal" data-key="loadHorizontalEnabled" ${ConfigManager.Horizontal.loadHorizontalEnabled ? 'checked' : ''}>
								</div>
								<div style="text-align: center;">
									<input type="checkbox" data-module="Horizontal" data-key="loadVerticalEnabled" ${ConfigManager.Horizontal.loadVerticalEnabled ? 'checked' : ''}>
								</div>
							</div>
							
							<div style="display: grid; grid-template-columns: 1fr 80px 80px; gap: 10px; align-items: center; margin-bottom: 12px; padding: 0 4px;">
								<div style="opacity: 0.9; font-size: 13px;">点击宽屏时</div>
								<div style="text-align: center;">
									<input type="checkbox" data-module="Horizontal" data-key="wideHorizontalEnabled" ${ConfigManager.Horizontal.wideHorizontalEnabled ? 'checked' : ''}>
								</div>
								<div style="text-align: center;">
									<input type="checkbox" data-module="Horizontal" data-key="wideVerticalEnabled" ${ConfigManager.Horizontal.wideVerticalEnabled ? 'checked' : ''}>
								</div>
							</div>
							
							<div style="display: grid; grid-template-columns: 1fr 80px 80px; gap: 10px; align-items: center; margin-bottom: 12px; padding: 0 4px;">
								<div style="opacity: 0.9; font-size: 13px;">退出全屏时</div>
								<div style="text-align: center;">
									<input type="checkbox" data-module="Horizontal" data-key="fullscreenHorizontalEnabled" ${ConfigManager.Horizontal.fullscreenHorizontalEnabled ? 'checked' : ''}>
								</div>
								<div style="text-align: center;">
									<input type="checkbox" data-module="Horizontal" data-key="fullscreenVerticalEnabled" ${ConfigManager.Horizontal.fullscreenVerticalEnabled ? 'checked' : ''}>
								</div>
							</div>
							
							<div style="display: grid; grid-template-columns: 1fr 80px 80px; gap: 10px; align-items: center; margin-bottom: 32px; padding: 0 4px;">
								<div style="opacity: 0.9; font-size: 13px;">退出画中画时</div>
								<div style="text-align: center;">
									<input type="checkbox" data-module="PiP" data-key="pipHorizontalEnabled" ${ConfigManager.PiP.pipHorizontalEnabled ? 'checked' : ''}>
								</div>
								<div style="text-align: center;">
									<input type="checkbox" data-module="PiP" data-key="pipVerticalEnabled" ${ConfigManager.PiP.pipVerticalEnabled ? 'checked' : ''}>
								</div>
							</div>
							
							
							<!-- 水平偏移量 -->
							<div class="setting-item">
								<span class="setting-label">水平偏移量 (px)</span>
								<input type="number" min="-200" max="200" step="1" data-module="Horizontal" data-key="offset" value="${ConfigManager.Horizontal.offset}">
							</div>
							
							<!-- 垂直偏移量 -->
							<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
								<span class="setting-label">垂直偏移量 (px)</span>
								<div style="display: flex; gap: 30px; align-items: center;">
									<div style="display: flex; align-items: center; gap: 4px;">
										<input type="checkbox" data-module="Horizontal" data-key="videoTopOffset" ${ConfigManager.Horizontal.videoTopOffset ? 'checked' : ''}>
										<span class="setting-label" style="font-size: 13px; margin: 0;">基于视频顶部</span>
									</div>
									<button class="btn small" id="get-current-distance">检查距离</button>
									<input type="number" min="0" max="500" step="1" data-module="Horizontal" data-key="verticalOffset" value="${ConfigManager.Horizontal.verticalOffset}">
								</div>
							</div>
							
							<!-- 提示信息 -->
							<div class="hint" style="margin-top: 10px; padding-left: 4px;">
								💡 基于视频顶部：偏移量从视频顶部开始计算，否则从页面顶部开始
							</div>
						</div>
					</div>
					
					<!-- 画中画页 -->
					<div class="page-container" id="page-pip">
						<div class="section">
							<div class="section-title">画中画控制</div>
							
							<div class="setting-item">
								<span class="setting-label">画中画尺寸 (%)</span>
								<input type="number" min="25" max="100" step="1" data-module="PiP" data-key="pipSize" value="${ConfigManager.PiP.pipSize}">
							</div>
							
							<div class="setting-item">
								<span class="setting-label">缩小画尺寸 (px)</span>
								<input type="number" min="250" max="800" step="10" data-module="PiP" data-key="shrunkSize" value="${ConfigManager.PiP.shrunkSize}">
							</div>
							
							<div class="setting-item">
								<span class="setting-label">遮罩模式</span>
								<div class="radio-group" data-module="PiP" data-key="overlayMode">
									<label><input type="radio" name="pip_overlay_mode" value="black" ${ConfigManager.PiP.overlayMode === 'black' ? 'checked' : ''}> 黑色遮罩</label>
									<label><input type="radio" name="pip_overlay_mode" value="adaptive" ${ConfigManager.PiP.overlayMode === 'adaptive' ? 'checked' : ''}> 自适应背景色</label>
								</div>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">遮罩浓度</span>
								<input type="number" min="0" max="1" step="0.05" data-module="PiP" data-key="overlayOpacity" value="${ConfigManager.PiP.overlayOpacity}">
							</div>
							
							<div class="setting-item">
								<span class="setting-label">缩小遮罩浓度</span>
								<input type="number" min="0" max="1" step="0.05" data-module="PiP" data-key="shrunkOverlayOpacity" value="${ConfigManager.PiP.shrunkOverlayOpacity}">
							</div>
			
							<div class="setting-item">
								<span class="setting-label">背景模糊模式</span>
								<div class="radio-group" data-module="PiP" data-key="blurMode">
									<label><input type="radio" name="pip_blur" value="none" ${ConfigManager.PiP.blurMode === 'none' ? 'checked' : ''}> 无</label>
									<label><input type="radio" name="pip_blur" value="pip-only" ${ConfigManager.PiP.blurMode === 'pip-only' ? 'checked' : ''}> 仅画中画</label>
									<label><input type="radio" name="pip_blur" value="pip-comment-mode" ${ConfigManager.PiP.blurMode === 'pip-comment-mode' ? 'checked' : ''}> 📃 悬浮评论（实验）</label>
								</div>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">模糊强度</span>
								<div style="display: flex; gap: 15px; align-items: center;">
									<div style="display: flex; align-items: center; gap: 4px; padding-right: 18px;" title="可节省模糊性能开销">
										<input type="checkbox" data-module="PiP" data-key="useCoverForBlur" ${ConfigManager.PiP.useCoverForBlur ? 'checked' : ''}>
										<span class="setting-label" style="font-size: 13px; margin: 0;">使用封面图作为模糊背景</span>
									</div>
									<input type="number" min="0" max="50" step="1" data-module="PiP" data-key="blurStrength" value="${ConfigManager.PiP.blurStrength}">
								</div>
							</div>
							
							<div class="divider-light"></div>
							
							<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
								<div style="display: flex; align-items: center; gap: 8px;">
									<span class="setting-label">向下滚动时缩小</span>
								</div>
								<div style="display: flex; align-items: center; gap: 15px;">
									<div style="display: flex; align-items: center; gap: 8px; padding-right: 18px;">
										<span class="setting-label" style="opacity: 0.7;">滚动距离</span>
										<input type="number" min="10" max="500" step="5" 
											   data-module="PiP" data-key="shrinkDownDistance" 
											   value="${ConfigManager.PiP.shrinkDownDistance}"
											   style="text-align: center;">
										<span style="opacity: 0.7;">px</span>
									</div>
									<input type="checkbox" data-module="PiP" data-key="shrinkOnScrollDown" ${ConfigManager.PiP.shrinkOnScrollDown ? 'checked' : ''}>
								</div>
							</div>

							<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
								<div style="display: flex; align-items: center; gap: 8px;">
									<span class="setting-label">向上滚动时恢复</span>
								</div>
								<div style="display: flex; align-items: center; gap: 15px;">
									<div style="display: flex; align-items: center; gap: 8px; padding-right: 18px;">
										<span class="setting-label" style="opacity: 0.7;">滚动距离</span>
										<input type="number" min="10" max="2000" step="10" 
											   data-module="PiP" data-key="restoreUpDistance" 
											   value="${ConfigManager.PiP.restoreUpDistance}"
											   style="text-align: center;">
										<span style="opacity: 0.7;">px</span>
									</div>
									<input type="checkbox" data-module="PiP" data-key="restoreOnScrollUp" ${ConfigManager.PiP.restoreOnScrollUp ? 'checked' : ''}>
								</div>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">点击视频外自动缩小</span>
								<input type="checkbox" data-module="PiP" data-key="clickOutsideToShrink" ${ConfigManager.PiP.clickOutsideToShrink ? 'checked' : ''}>
							</div>
						</div>
					</div>
					
					<!-- 动态特效页 -->
					<div class="page-container" id="page-effect">
						<div class="section">
							<div class="section-title">画中画动态特效</div>
							
							<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; width: 100%; margin: 10px 0 20px 0;" data-module="PiP" data-key="effectMode">
								<div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
									<input type="radio" name="pip_effect" value="none" id="effect_none" ${ConfigManager.PiP.effectMode === 'none' ? 'checked' : ''}>
									<label for="effect_none" style="cursor: pointer;">🚫 无　</label>
								</div>
								<div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
									<input type="radio" name="pip_effect" value="random" id="effect_random" ${ConfigManager.PiP.effectMode === 'random' ? 'checked' : ''}>
									<label for="effect_random" style="cursor: pointer;">🎲 随机</label>
								</div>
								<div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
									<input type="radio" name="pip_effect" value="star" id="effect_star" ${ConfigManager.PiP.effectMode === 'star' ? 'checked' : ''}>
									<label for="effect_star" style="cursor: pointer;">🌟 星光</label>
								</div>
								<div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
									<input type="radio" name="pip_effect" value="rain" id="effect_rain" ${ConfigManager.PiP.effectMode === 'rain' ? 'checked' : ''}>
									<label for="effect_rain" style="cursor: pointer;">🌧️ 细雨</label>
								</div>
								<div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
									<input type="radio" name="pip_effect" value="orb" id="effect_orb" ${ConfigManager.PiP.effectMode === 'orb' ? 'checked' : ''}>
									<label for="effect_orb" style="cursor: pointer;">☀️ 光球</label>
								</div>
								<div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
									<input type="radio" name="pip_effect" value="meteor" id="effect_meteor" ${ConfigManager.PiP.effectMode === 'meteor' ? 'checked' : ''}>
									<label for="effect_meteor" style="cursor: pointer;">🌠 流星</label>
								</div>
								<div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
									<input type="radio" name="pip_effect" value="borderlight" id="effect_borderlight" ${ConfigManager.PiP.effectMode === 'borderlight' ? 'checked' : ''}>
									<label for="effect_borderlight" style="cursor: pointer;">🌈 拂光</label>
								</div>
								<div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
									<input type="radio" name="pip_effect" value="phantom" id="effect_phantom" ${ConfigManager.PiP.effectMode === 'phantom' ? 'checked' : ''}>
									<label for="effect_phantom" style="cursor: pointer;">🎞️ 描画</label>
								</div>
							</div>
							
							<div class="divider-light"></div>
							
							<div class="setting-item">
								<span class="setting-label">效果强度</span>
								<div style="gap: 14px;" class="radio-group" data-module="PiP" data-key="particleCount">
									<label><input type="radio" name="pip_particle" value="lowest" ${ConfigManager.PiP.particleCount === 'lowest' ? 'checked' : ''}> 最低</label>
									<label><input type="radio" name="pip_particle" value="low" ${ConfigManager.PiP.particleCount === 'low' ? 'checked' : ''}> 低</label>
									<label><input type="radio" name="pip_particle" value="medium" ${ConfigManager.PiP.particleCount === 'medium' ? 'checked' : ''}> 中等</label>
									<label><input type="radio" name="pip_particle" value="high" ${ConfigManager.PiP.particleCount === 'high' ? 'checked' : ''}> 高</label>
									<label><input type="radio" name="pip_particle" value="highest" ${ConfigManager.PiP.particleCount === 'highest' ? 'checked' : ''}> 最高</label>
								</div>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">特效帧率</span>
								<div style="gap: 14px;" class="radio-group" data-module="PiP" data-key="frameRate">
									<label><input type="radio" name="pip_frame" value="30" ${ConfigManager.PiP.frameRate == 30 ? 'checked' : ''}> 30</label>
									<label><input type="radio" name="pip_frame" value="60" ${ConfigManager.PiP.frameRate == 60 ? 'checked' : ''}> 60</label>
									<label><input type="radio" name="pip_frame" value="75" ${ConfigManager.PiP.frameRate == 75 ? 'checked' : ''}> 75</label>
									<label><input type="radio" name="pip_frame" value="90" ${ConfigManager.PiP.frameRate == 90 ? 'checked' : ''}> 90</label>
									<label><input type="radio" name="pip_frame" value="144" ${ConfigManager.PiP.frameRate == 144 ? 'checked' : ''}> 144</label>
									<label><input type="radio" name="pip_frame" value="240" ${ConfigManager.PiP.frameRate == 240 ? 'checked' : ''}> 240</label>
									<label><input type="radio" name="pip_frame" value="300" ${ConfigManager.PiP.frameRate == 300 ? 'checked' : ''}> 300</label>
								</div>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">粒子特效全局透明度</span>
								<input type="number" min="0.1" max="1" step="0.05" data-module="PiP" data-key="effectGlobalOpacity" value="${ConfigManager.PiP.effectGlobalOpacity}">
							</div>
							
							<div class="setting-item" title="可减轻高分辨率下的绘制压力">
								<span class="setting-label">粒子数量自适应分辨率</span>
								<input type="checkbox" data-module="PiP" data-key="dynamicParticleCount" ${ConfigManager.PiP.dynamicParticleCount ? 'checked' : ''}>
							</div>
							
							<div class="setting-item" title="粒子特效显示在画中画窗口上方">
								<span class="setting-label">特效层级提高</span>
								<input type="checkbox" data-module="PiP" data-key="effectLayer" ${ConfigManager.PiP.effectLayer ? 'checked' : ''}>
							</div>
							
							<div class="setting-item" title="适用于高刷新率屏幕动画速度过快的情况，特效帧率高于显示器刷新率会使动画速度变慢">
								<span class="setting-label">帧率对动画速度补偿</span>
								<input type="checkbox" data-module="PiP" data-key="speedCompensation" ${ConfigManager.PiP.speedCompensation ? 'checked' : ''}>
							</div>
						</div>
					</div>
					
					<!-- 自动化页 -->
					<div class="page-container" id="page-auto">
						<div class="section">
							<div class="section-title">自动化</div>
							
							<div class="setting-item" style="flex-direction: column; align-items: flex-start; gap: 8px; margin-bottom: 32px;">
								<div style="margin: 8px 0 16px 0;">
								<span class="setting-label" style="font-size: 15px; font-weight: 300; color: #00aeec;">️页面加载</span>
							</div>
								<div class="radio-group" data-module="Auto" data-key="loadAction" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; width: 100%; padding-left: 6px;">
									<label style="display: flex; align-items: center; gap: 8px;"><input type="radio" name="load_action" value="none" ${ConfigManager.Auto.loadAction === 'none' ? 'checked' : ''}> 无</label>
									<label style="display: flex; align-items: center; gap: 8px;"><input type="radio" name="load_action" value="pip" ${ConfigManager.Auto.loadAction === 'pip' ? 'checked' : ''}> 页面加载时开启画中画</label>
									<label style="display: flex; align-items: center; gap: 8px;"><input type="radio" name="load_action" value="wide" ${ConfigManager.Auto.loadAction === 'wide' ? 'checked' : ''}> 页面加载时自动宽屏</label>
									<label style="display: flex; align-items: center; gap: 8px;"><input type="radio" name="load_action" value="fullscreen" ${ConfigManager.Auto.loadAction === 'fullscreen' ? 'checked' : ''}> 页面加载时网页全屏</label>
								</div>
							</div>
							
							<div style="margin: 8px 0 16px 0;">
								<span class="setting-label" style="font-size: 15px; font-weight: 300; color: #00aeec;">️半自动</span>
							</div>
							<div class="setting-item">
								<span class="setting-label">播放时进入浏览器全屏</span>
								<input type="checkbox" data-module="Auto" data-key="playEnterFullscreen" ${ConfigManager.Auto.playEnterFullscreen ? 'checked' : ''}>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">暂停时退出浏览器全屏</span>
								<input type="checkbox" data-module="Auto" data-key="pauseExitFullscreen" ${ConfigManager.Auto.pauseExitFullscreen ? 'checked' : ''}>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">点击画中画按钮时进入浏览器全屏</span>
								<input type="checkbox" data-module="Auto" data-key="pipEnterFullscreen" ${ConfigManager.Auto.pipEnterFullscreen ? 'checked' : ''}>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">退出画中画时退出浏览器全屏</span>
								<input type="checkbox" data-module="Auto" data-key="pipExitFullscreen" ${ConfigManager.Auto.pipExitFullscreen ? 'checked' : ''}>
							</div>
							
							<div class="divider-space"></div>
							
							<div class="setting-item">
								<span class="setting-label">开启画中画时自动播放</span>
								<input type="checkbox" data-module="Auto" data-key="pipEnterAutoPlay" ${ConfigManager.Auto.pipEnterAutoPlay ? 'checked' : ''}>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">退出画中画时自动暂停</span>
								<input type="checkbox" data-module="Auto" data-key="pipExitAutoPause" ${ConfigManager.Auto.pipExitAutoPause ? 'checked' : ''}>
							</div>
						</div>
					</div>
					
					<!-- 杂项页 -->
					<div class="page-container" id="page-other">
						<div class="section">
							<div class="section-title">杂项</div>
							
							<div class="setting-item">
								<span class="setting-label">性能模式</span>
								<input type="checkbox" data-module="Other" data-key="performanceMode" ${ConfigManager.Other.performanceMode ? 'checked' : ''}>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">防止空格键下滑</span>
								<input type="checkbox" data-module="Other" data-key="preventSpaceScroll" ${ConfigManager.Other.preventSpaceScroll ? 'checked' : ''}>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">显示画中画按钮</span>
								<input type="checkbox" data-module="Other" data-key="showPipButton" ${ConfigManager.Other.showPipButton ? 'checked' : ''}>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">显示画中画尺寸按钮</span>
								<input type="checkbox" data-module="Other" data-key="showSizeButton" ${ConfigManager.Other.showSizeButton ? 'checked' : ''}>
							</div>
							
							<div class="setting-item">
								<span class="setting-label">显示画中画容器关闭按钮</span>
								<input type="checkbox" data-module="Other" data-key="showPipContainerCloseButton" ${ConfigManager.Other.showPipContainerCloseButton ? 'checked' : ''}>
							</div>
							
							<div class="setting-item" id="size-button-mode-setting" style="${!ConfigManager.Other.showSizeButton ? 'opacity:0.5;pointer-events:none;' : ''}">
								<span class="setting-label">尺寸按钮模式</span>
								<div class="radio-group" data-module="Other" data-key="sizeButtonMode">
									<label><input type="radio" name="size_button_mode" value="temporary" ${ConfigManager.Other.sizeButtonMode === 'temporary' ? 'checked' : ''}> 临时调节</label>
									<label><input type="radio" name="size_button_mode" value="permanent" ${ConfigManager.Other.sizeButtonMode === 'permanent' ? 'checked' : ''}> 永久修改</label>
								</div>
							</div>
							
							<div class="setting-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
								<span class="setting-label">隐藏滚动条</span>
								<div class="radio-group" data-module="Other" data-key="scrollbarHideMode" style="display: flex; gap: 15px;">
									<label><input type="radio" name="scrollbar_hide" value="none" ${ConfigManager.Other.scrollbarHideMode === 'none' ? 'checked' : ''}> 无</label>
									<label><input type="radio" name="scrollbar_hide" value="pip-only" ${ConfigManager.Other.scrollbarHideMode === 'pip-only' ? 'checked' : ''}> 仅画中画</label>
									<label><input type="radio" name="scrollbar_hide" value="always" ${ConfigManager.Other.scrollbarHideMode === 'always' ? 'checked' : ''}> 总是</label>
								</div>
							</div>
						</div>
					</div>
					
					<!-- 整蛊页 -->
					<div class="page-container" id="page-ad">
						<div class="section" style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
							<div id="ad-countdown" style="font-size: 144px; font-weight: 400; color: #00aeec; margin-bottom: 200px;">3</div>
							<div id="ad-message" style="font-size: 36px; font-weight: bold; color: #ff6b6b; margin-bottom: 300px; text-align: center; display: none;">这次没有广告，请放心使用 😊</div>	
							<div id="ad-message2" style="font-size: 12px; font-weight: bold; color: inherit; text-align: center; display: none;">请不要支持作者，你的不支持是作者鸽新的动力。 🕊️</div>
						</div>
					</div>
				</div>
				
				<!-- 帮助页 -->
				<div class="page-container" id="page-help" style="height: 100%; overflow-y: auto;">
					<div class="section">
						<div class="section-title">💡 FAQ</div>
							<div class="faq-item">
								<div class="faq-question"><span>1.</span> 页面定位系统是做什么的？</div>
								<div class="faq-answer">
									页面定位系统可以自动调整页面位置，它主要提供两种功能：水平居中和垂直偏移，无需再手动拖拽滚动条来获得最佳观看位置。
								</div>
							</div>
							
							<div class="faq-item">
								<div class="faq-question"><span>2.</span> 水平偏移量是什么？</div>
								<div class="faq-answer">
									水平偏移量允许微调页面水平居中的位置。可以根据个人习惯调整这个值（正数向右偏移，负数向左偏移），找到最适合位置。
									配合<a href="https://greasyfork.qytechs.cn/zh-CN/scripts/490676-b%E7%AB%99-bilibili-%E5%88%86p%E8%A7%86%E9%A2%91%E8%AF%A6%E6%83%85%E9%A1%B5%E4%BC%98%E5%8C%96" target="_blank" style="color: inherit; text-decoration: none; font-size: 14px; font-weight: 350;">B站|bilibili 分P视频详情页优化</a>使用最佳。
								</div>
							</div>
							
							<div class="faq-item">
								<div class="faq-question"><span>3.</span> 为什么我没有勾选“点击宽屏时垂直偏移”，页面还是会自动滚动？</div>
								<div class="faq-answer">
									这是B站播放器自身的默认行为，并非本脚本导致。
								</div>
							</div>
							
							<div class="faq-item">
								<div class="faq-question"><span>4.</span> 画中画尺寸调节无效？</div>
								<div class="faq-answer">
									尺寸按钮有"临时调节"和"永久修改"两种模式，可在杂项中切换。临时调节和拖拽边框调节只影响当前播放；永久修改会保存为默认尺寸，后续开启画中画都会使用这个尺寸。
								</div>
							</div>
							
							<div class="faq-item">
								<div class="faq-question"><span>5.</span> 为什么遮罩浓度有时不起作用？</div>
								<div class="faq-answer">
									在启用悬浮评论或某些动态特效时，为了保证视觉效果，遮罩浓度会被固定在特定值。
								</div>
							</div>
							
							<div class="faq-item">
								<div class="faq-question"><span>6.</span> 为什么打开画中画时不能通过滚动缩小？</div>
								<div class="faq-answer">
									开启画中画后有2秒的防误触保护期，避免刚开启就因意外滚动而自动缩小。
								</div>
							</div>
							
							<div class="faq-item">
								<div class="faq-question"><span>7.</span> 为什么启用动态特效会出现屏闪？</div>
								<div class="faq-answer">
									如果你的浏览器在系统图形设置中使用了"高性能"模式，开启粒子特效时可能会出现屏闪。可以尝试在浏览器快捷方式的目标路径后添加启动参数： --disable-direct-composition-video-overlays=1（注意是两个连字符，前面带空格）。具体操作：右键浏览器快捷方式→属性→目标→在末尾添加该参数。
								</div>
							</div>
							
							<div class="faq-item">
								<div class="faq-question"><span>8.</span> 性能模式有什么用？</div>
								<div class="faq-answer">
									开启性能模式后，一些动画和过渡效果将被禁用（如画中画缩放动画、遮罩淡入淡出等），可降低低配置设备上的资源消耗。
								</div>
							</div>
							
							<div class="faq-item">
								<div class="faq-question"><span>9.</span> 为什么滚动条不见了？</div>
								<div class="faq-answer">
									滚动条的显示由杂项中的"隐藏滚动条"选项控制。共有三种模式：无（始终显示）、仅画中画（只在画中画开启时隐藏）、总是（始终隐藏但保留滚动功能）。切换为“无”来恢复滚动条显示。
								</div>
							</div>
							
							<div class="faq-item">
								<div class="faq-question"><span>10.</span> 为什么不能自动退出浏览器全屏？</div>
								<div class="faq-answer">
									手动浏览器全屏（F11）无法通过 JavaScript 自动退出。
								</div>
							</div>
							
							<div style="background: rgba(0, 174, 236, 0.1); border-left: 4px solid #00aeec; padding: 12px;">
								<div style="font-weight: bold; color: #00aeec; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
									<span style="font-size: 18px;">📭</span> 反馈
								</div>
								<div style="padding-left: 26px; color: inherit; opacity: 0.9; line-height: 1.6;">
									欢迎在GitHub上提交Issues：
									<a href="https://github.com/Loge-Like/bilibili-pip-helper/issues" target="_blank" style="color: inherit; text-decoration: none; font-size: 14px; font-weight: 350;">
										GitHub
									</a>
								</div>
							</div>
							
							<div style="margin-top: 20px; text-align: center; opacity: 0.6; font-size: 12px;">
								哔哩哔哩视频浮窗定位助手 | by 萝哥-like
							</div>
							
						</div>
					</div>
				</div>
			</div>
		`;
		
		document.body.appendChild(newPanel);
		bindPanelEvents(newPanel);
		return newPanel;
	}

	// -- 绑定面板事件 --
	function bindPanelEvents(panel) {
		if (panel._eventsBound) return;
		panel._eventsBound = true;
		
		const closeBtn = panel.querySelector('.close-btn');
		if (closeBtn) {
			const newCloseBtn = closeBtn.cloneNode(true);
			closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
			
			newCloseBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				togglePanel();
			});
		}

		// # 阻止面板内点击冒泡
		panel.addEventListener('click', (e) => e.stopPropagation());
		
		// # 标签切换功能
		const tabs = panel.querySelectorAll('.panel-tab');
		const pages = {
			'position': panel.querySelector('#page-position'),
			'pip': panel.querySelector('#page-pip'),
			'effect': panel.querySelector('#page-effect'),
			'auto': panel.querySelector('#page-auto'),
			'other': panel.querySelector('#page-other'),
			'ad': panel.querySelector('#page-ad'),
			'help': panel.querySelector('#page-help')
		};

		tabs.forEach(tab => {
			tab.addEventListener('click', () => {
				tabs.forEach(t => t.classList.remove('active'));
				tab.classList.add('active');
				
				Object.values(pages).forEach(page => {
					if (page) page.classList.remove('active');
				});
				
				const pageId = tab.dataset.page;
				if (pages[pageId]) {
					pages[pageId].classList.add('active');
					
					if (pageId === 'ad') {
						startAdCountdown();
					}
				}
			});
		});

		// 复选框变化
		panel.querySelectorAll('input[type="checkbox"][data-module][data-key]').forEach(cb => {
			cb.addEventListener('change', (e) => {
				const module = e.target.dataset.module;
				const key = e.target.dataset.key;
				const value = e.target.checked;
				setConfigValue(module, key, value);
			});
		});

		// # 数字输入框变化
		panel.querySelectorAll('input[type="number"][data-module][data-key]').forEach(input => {
			input.addEventListener('change', (e) => {
				const module = e.target.dataset.module;
				const key = e.target.dataset.key;
				const value = parseFloat(e.target.value);
				if (!isNaN(value)) {
					setConfigValue(module, key, value);
				}
			});
		});

		// # 滑块输入
		panel.querySelectorAll('input[type="range"][data-module][data-key]').forEach(slider => {
			const display = slider.closest('.setting-item')?.querySelector('.value-display');
			slider.addEventListener('input', (e) => {
				if (display) {
					display.textContent = parseFloat(e.target.value).toFixed(2);
				}
			});
			slider.addEventListener('change', (e) => {
				const module = e.target.dataset.module;
				const key = e.target.dataset.key;
				const value = parseFloat(e.target.value);
				setConfigValue(module, key, value);
			});
		});
		
		// # 遮罩颜色单选
		panel.querySelectorAll('input[name="pip_overlay_mode"]').forEach(radio => {
			radio.addEventListener('change', (e) => {
				if (e.target.checked) {
					GM_setValue('pip_overlay_mode', e.target.value);
					ConfigManager.PiP.overlayMode = e.target.value;
				}
			});
		});
		
		panel.querySelectorAll('input[name="pip_blur"]').forEach(radio => {
			radio.addEventListener('change', (e) => {
				if (e.target.checked) {
					GM_setValue('pip_blur_mode', e.target.value);
					ConfigManager.PiP.blurMode = e.target.value;
				}
			});
		});
		
		// # 动态特效
		panel.querySelectorAll('input[name="pip_effect"]').forEach(radio => {
			radio.addEventListener('change', (e) => {
				if (e.target.checked) {
					GM_setValue('pip_effect_mode', e.target.value);
					ConfigManager.PiP.effectMode = e.target.value;
				}
			});
		});
		
		// # 动态特效粒子密度
		panel.querySelectorAll('input[name="pip_particle"]').forEach(radio => {
			radio.addEventListener('change', (e) => {
				if (e.target.checked) {
					GM_setValue('pip_particle_count', e.target.value);
					ConfigManager.PiP.particleCount = e.target.value;
				}
			});
		});
		
		// # 动态特效刷新率
		panel.querySelectorAll('input[name="pip_frame"]').forEach(radio => {
			radio.addEventListener('change', (e) => {
				if (e.target.checked) {
					const value = parseInt(e.target.value);
					GM_setValue('pip_frame_rate', value);
					ConfigManager.PiP.frameRate = value;
				}
			});
		});
		
		// # 显示尺寸按钮复选框的联动
		const showSizeCheckbox = panel.querySelector('input[data-key="showSizeButton"]');
		const modeSetting = document.getElementById('size-button-mode-setting');

		if (showSizeCheckbox && modeSetting) {
			showSizeCheckbox.addEventListener('change', (e) => {
				if (e.target.checked) {
					modeSetting.style.opacity = '1';
					modeSetting.style.pointerEvents = 'auto';
				} else {
					modeSetting.style.opacity = '0.5';
					modeSetting.style.pointerEvents = 'none';
				}
			});
		}

		// # 尺寸按钮模式单选
		panel.querySelectorAll('input[name="size_button_mode"]').forEach(radio => {
			radio.addEventListener('change', (e) => {
				if (e.target.checked) {
					GM_setValue('size_button_mode', e.target.value);
					ConfigManager.Other.sizeButtonMode = e.target.value;
					
					const hint = document.createElement('div');
					hint.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#00aeec;color:white;padding:8px 16px;border-radius:20px;font-size:14px;z-index:2147483647;';
					hint.textContent = e.target.value === 'temporary' ? '尺寸按钮将临时调节画中画大小' : '尺寸按钮将永久修改画中画默认尺寸';
					document.body.appendChild(hint);
					setTimeout(() => hint.remove(), 3000);
				}
			});
		});
		
		// # 滚动条隐藏模式单选
		panel.querySelectorAll('input[name="scrollbar_hide"]').forEach(radio => {
			radio.addEventListener('change', (e) => {
				if (e.target.checked) {
					GM_setValue('scrollbar_hide_mode', e.target.value);
					ConfigManager.Other.scrollbarHideMode = e.target.value;
					
					updateScrollbarVisibility();
					
					const hint = document.createElement('div');
					hint.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#00aeec;color:white;padding:8px 16px;border-radius:20px;font-size:14px;z-index:2147483647;';
					hint.textContent = e.target.value === 'none' ? '滚动条显示' : (e.target.value === 'pip-only' ? '仅画中画时隐藏滚动条' : '始终隐藏滚动条');
					document.body.appendChild(hint);
					setTimeout(() => hint.remove(), 3000);
				}
			});
		});
		
		// # 页面加载自动化单选
		panel.querySelectorAll('input[name="load_action"]').forEach(radio => {
			radio.addEventListener('change', (e) => {
				if (e.target.checked) {
					const value = e.target.value;
					ConfigManager.Auto.loadAction = value;
					GM_setValue('auto_load_action', value);
					
					const hint = document.createElement('div');
					hint.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#00aeec;color:white;padding:8px 16px;border-radius:20px;font-size:14px;z-index:2147483647;';
					hint.textContent = '页面加载选项已保存，刷新页面后生效';
					document.body.appendChild(hint);
					setTimeout(() => hint.remove(), 3000);
				}
			});
		});
		
		// # 获取当前距离按钮
		const getDistanceBtn = document.getElementById('get-current-distance');

		if (getDistanceBtn) {
			getDistanceBtn.addEventListener('click', () => {
				const currentY = window.scrollY;
				const videoContainer = document.querySelector(SELECTORS.videoContainer);
				
				const hint = document.createElement('div');
				hint.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#00aeec;color:white;padding:8px 16px;border-radius:20px;font-size:14px;z-index:2147483647;';
				
				if (videoContainer) {
					const videoRect = videoContainer.getBoundingClientRect();
					const videoTopAbsolute = Math.round(window.scrollY + videoRect.top);
					const diff = Math.abs(currentY - videoTopAbsolute);
					
					hint.textContent = `页面当前位置： ${Math.round(currentY)}px，现距离视频顶部： ${Math.round(diff)}px`;
				}
					
				document.body.appendChild(hint);
				setTimeout(() => hint.remove(), 5000);
		
			});
		}
		
		// # 为每个 section 添加“默认”按钮
		const sections = panel.querySelectorAll('.section');
		sections.forEach(section => {
			const titleDiv = section.querySelector('.section-title');
			if (!titleDiv) return;
			if (section.closest('#page-help')) return;
			
			const resetBtn = document.createElement('button');
			resetBtn.className = 'reset-btn';
			resetBtn.textContent = '默认';
			resetBtn.title = '重置本组所有选项为默认值';
			titleDiv.appendChild(resetBtn);
			
			resetBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				
				const inputs = section.querySelectorAll('input[type="checkbox"][data-module][data-key], input[type="number"][data-module][data-key]');
				inputs.forEach(item => {
					const module = item.dataset.module;
					const key = item.dataset.key;
					const defaultValue = DEFAULT_CONFIG[module]?.[key];
					if (defaultValue === undefined) return;
					
					if (item.type === 'checkbox') {
						item.checked = defaultValue;
						setConfigValue(module, key, defaultValue);
					} else if (item.type === 'number') {
						item.value = defaultValue;
						setConfigValue(module, key, defaultValue);
					}
				});
				
				const radioGroups = section.querySelectorAll('[data-module][data-key]');
				radioGroups.forEach(group => {
					const module = group.dataset.module;
					const key = group.dataset.key;
					const defaultValue = DEFAULT_CONFIG[module]?.[key];
					if (defaultValue === undefined) return;
					
					const radios = group.querySelectorAll('input[type="radio"]');
					radios.forEach(radio => {
						if (radio.value === String(defaultValue)) {
							radio.checked = true;
							setConfigValue(module, key, defaultValue);
						}
					});
				});
				
				const scrollbarRadios = section.querySelectorAll('input[name="scrollbar_hide"]');
				if (scrollbarRadios.length) {
					updateScrollbarVisibility();
				}
				
				const hint = document.createElement('div');
				hint.textContent = '已恢复默认设置';
				hint.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#00aeec;color:white;padding:6px 12px;border-radius:20px;font-size:12px;z-index:2147483647;';
				document.body.appendChild(hint);
				setTimeout(() => hint.remove(), 1500);
			});
		});
		
		// # 广告区倒计时功能
		let countdownInterval = null;

		function startAdCountdown() {
			if (countdownInterval) {
				clearInterval(countdownInterval);
				countdownInterval = null;
			}
			
			const countdownEl = document.getElementById('ad-countdown');
			const messageEl = document.getElementById('ad-message');
			const message2El = document.getElementById('ad-message2');
			
			if (!countdownEl || !messageEl || !message2El) return;
			
			countdownEl.style.display = 'block';
			countdownEl.textContent = '3';
			messageEl.style.display = 'none';
			message2El.style.display = 'none';
			
			let count = 3;
			countdownInterval = setInterval(() => {
				count--;
				if (count > 0) {
					countdownEl.textContent = count;
				} else {
					clearInterval(countdownInterval);
					countdownInterval = null;
					countdownEl.style.display = 'none';
					messageEl.style.display = 'block';
					message2El.style.display = 'block';
				}
			}, 1000);
		}
	}

	// -- 初始化面板 --
	let panel = null;

	function initVisualPanel() {
		injectPanelStyles();
		
		if (!document.getElementById('bili-pip-mask')) {
			const mask = document.createElement('div');
			mask.id = 'bili-pip-mask';
			document.body.appendChild(mask);
			mask.addEventListener('click', () => {
				if (panel && panel.classList.contains('show')) {
					togglePanel();
				}
			});
		}
	}

	function togglePanel() {
		const mask = document.getElementById('bili-pip-mask');
		
		if (PictureInPictureSystem.enabled) {
				PictureInPictureSystem.toggle(false);
			}
		
		if (panel && panel.classList.contains('show')) {
			if (panel.parentNode) {
				panel.parentNode.removeChild(panel);
			}
			panel = null;
			
			if (mask) mask.classList.remove('show');
			return;
		} else {
			if (panel) {
				if (panel.parentNode) panel.parentNode.removeChild(panel);
				panel = null;
			}
			panel = createPanel();
			panel.classList.add('show');
			if (mask) mask.classList.add('show');
		}
	}
	
	
    // ==== 画中画系统 ====
    const PictureInPictureSystem = (function() {
        const state = {
            enabled: false,
            videoContainer: null,
            videoElement: null,
            originalContainer: null,
            originalNextSibling: null,
            overlay: null,
			coverBlurLayer: null,
			currentCoverUrl: null, 
            button: null,
            sizeButton: null,
            isShrunk: false,
            isShrunkByClick: false,
            sendingBarContainer: null,
            sendingBarOriginalStyle: null,
			// 评论区悬浮
			commentPipContainer: null,
            // 事件处理器引用
            scrollHandler: null,
            clickOutsideHandler: null,
            fullscreenHandler: null,
            escHandler: null,
            restoreClickHandler: null,
			globalMouseUpHandler: null,
            // 观察者
            pageObserver: null,
			buttonLogeNewLike: null,
            buttonCheckInterval: null,
			// 画中画关闭按钮
			closeButton: null,
			globalCloseButton: null,
			// 拖拽调节画中画尺寸
			handles: null,
			isResizing: false,
			justResized: false,
			resizeTimeout: null,
			isMouseDown: false,
			rafId: null,
			// 动态特效
			canvasLayer: null,
			ctx: null,
			particles: [],
			glowData: null,
			phantomData: null,
			currentEffectiveEffect: null,
			particlePool: null,
			_resizeHandler: null,
			// 帧率相关
			cachedFrameInterval: null,
			cachedTargetFPS: null,
			lastFrameTime: 0,
			animationFrame: null,
			// 动态特效播放状态相关
			isVideoPlaying: false,
			effectEnabled: false,
			videoPlayHandler: null,
			videoPauseHandler: null,
			videoElementObserved: false,
        };
				
        // -- 样式注入 --
        function injectStyles() {
            if (document.querySelector('style[data-bili-pip]')) return;

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
						padding: 0 !important;
						width: auto !important;
						max-width: none !important;
						min-width: auto !important;
						transition: all 0.3s ease !important;
					}
				`;
			}

            GM_addStyle(`				
				/* -- 画中画按钮样式 -- */
				.bili-pip-btn-sending {
					display: inline-flex !important;
					align-items: center !important;
					justify-content: center !important;
					width: 28px !important;
					height: 28px !important;
					min-width: 28px !important;
					min-height: 28px !important;
					margin: 6px 6px 6px 0 !important;
					padding: 0 !important;
					background: rgba(0, 0, 0, 0.15) !important;
					border: 1px solid rgba(255, 255, 255, 0.1) !important;
					outline: none !important;
					border-radius: 4px !important;
					color: #777777 !important;
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
					   border-color: transparent !important;
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
				
				/* 画中画按钮深色模式 */
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
				
				/* -- 尺寸调节按钮样式 -- */
				.bili-pip-size-btn {
					display: inline-flex !important;
					flex-direction: column !important;
					align-items: center !important;
					justify-content: center !important;
					width: 17px !important;
					height: 25px !important;
					min-width: 17px !important;
					min-height: 25px !important;
					margin: 6px 6px 6px 0 !important;
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
					font-size: 16px !important;
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

				/* 尺寸按钮深色模式 */
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

				/* 深色模式悬停效果 */
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

				/* -- 发送栏修复 -- */
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
					padding: 0 0 0 8px !important;
					transition: ${ConfigManager.Other.performanceMode ? 'none' : 'all 0.3s ease'} !important;
				}
				
				/* 发送框 */
				.bpx-player-dm-root {
					margin: 0 0 0 0 !important;
					transition: margin 0.3s ease;
				}
				
				.bili-pip-mode .bpx-player-dm-root {
					margin: 6px 10px 6px 0 !important;
				}

				/* -- 画中画容器 -- */
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

				/* 遮罩层样式 */
				.bili-pip-overlay {
					position: fixed;
					top: 0;
					left: 0;
					width: 100vw;
					height: 100vh;
					z-index: 2147483636;
					pointer-events: none;
					transition: ${ConfigManager.Other.performanceMode ? 'none' : 'all 0.5s ease'};
				}
				
				/* 拖拽时强制隐藏发送栏 */
				.bili-pip-resizing .bpx-player-sending-bar,
				.bili-pip-resizing:hover .bpx-player-sending-bar {
					opacity: 0 !important;
					visibility: hidden !important;
					pointer-events: none !important;
					transition: none !important;
				}
				
				/* 缩小时隐藏观看人数信息 */
				.bili-pip-mode.shrunk .bpx-player-video-info {
					display: none !important;
				}
				
				/* 投币收藏窗 */
				.bili-dialog-m {
					z-index: 2147483647;
				}
				
				/* 评论区图片关闭按钮 */
				.pswp {
					z-index: 2147483647 !important;
				}
			`);
        }		
		
		// -- 画中画按钮类与尺寸调节 --
		function toggle(force) {
            const target = force !== undefined ? force : !state.enabled;
            if (target) enable();
            else disable();		
        }
        
		function injectButton() {
			if (!ConfigManager.Other.showPipButton) return false;
			if (state.button && state.button.isConnected) return true;

			const sendingBar = document.querySelector(SELECTORS.sendingBar);
			if (!sendingBar) return false;

			// 移除可能已存在的按钮
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

			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				e.preventDefault();

				if (!state.enabled) {
					enable();
					updateButtonAppearance();
				} else {
					if (state.isShrunk) {
						expandToCenter();
					} else {
						shrinkToCorner(true);
					}
							
					updateButtonAppearance();
				}
			});

			state.button = btn;
			updateButtonAppearance();

			return true;
		}
		
	
		function updateButtonAppearance() {
			if (!state.button) return;
			
			if (!state.enabled) {
				state.button.title = '开启画中画模式';
				state.button.classList.remove('active');
			} else {
				state.button.title = state.isShrunk ? '展开画中画' : '缩小画中画';
				state.button.classList.add('active');
			}
		}

		function injectSizeButton() {
			if (!ConfigManager.Other.showSizeButton) return;
			if (state.sizeButton && state.sizeButton.isConnected) return;

			const sendingBar = document.querySelector(SELECTORS.sendingBar);
			if (!sendingBar) return;

			const oldBtn = sendingBar.querySelector('.bili-pip-size-btn');
			if (oldBtn) oldBtn.remove();

			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'bili-pip-size-btn';
			btn.title = ConfigManager.Other.sizeButtonMode === 'temporary' ? '临时调节尺寸' : '修改默认尺寸';
			btn.innerHTML = `<div class="size-up">+</div><div class="size-down">-</div>`;

			try { sendingBar.insertBefore(btn, state.button.nextSibling); }
			catch (e) { sendingBar.appendChild(btn); }
			
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				e.preventDefault();
				if (!state.enabled) return;
				
				const rect = btn.getBoundingClientRect();
				const clickY = e.clientY - rect.top;
				const half = rect.height / 2;
				const isIncrease = clickY < half;
				const factor = isIncrease ? 1.05 : 0.95;
				
				const isPermanent = ConfigManager.Other.sizeButtonMode === 'permanent';
				adjustSize(factor, isPermanent);
			});
			
			state.sizeButton = btn;
		}

        function adjustSize(factor, isPermanent = false) {
			if (!state.videoContainer) return;
			
			const currentWidth = state.videoContainer.offsetWidth;
			let newWidth = currentWidth * factor;
			
			const minWidth = state.isShrunk ? 250 : 400;
			const maxWidth = state.isShrunk ? 800 : Math.min(window.innerWidth * 0.95, 7680);
			
			newWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
			
			const aspect = getVideoAspectRatio(state.videoElement, state.videoContainer);
			const newHeight = newWidth / aspect;
			
			state.videoContainer.style.width = newWidth + 'px';
			state.videoContainer.style.height = newHeight + 'px';
			
			if (isPermanent) {
				if (state.isShrunk) {
					ConfigManager.PiP.shrunkSize = Math.round(newWidth);
					GM_setValue('pip_shrunk_size', Math.round(newWidth));
				} else {
					const pipPercent = Math.round((newWidth / window.innerWidth) * 100);
					ConfigManager.PiP.pipSize = pipPercent;
					GM_setValue('pip_size', pipPercent);
				}
			}
		}
		
		function createResizeHandles(container) {
			const handles = {};
			const positions = [
				{ name: 'nw', style: { top: '-5px', left: '-5px', width: '10px', height: '10px', cursor: 'nw-resize' } },
				{ name: 'ne', style: { top: '-5px', right: '-5px', width: '10px', height: '10px', cursor: 'ne-resize' } },
				{ name: 'sw', style: { bottom: '-5px', left: '-5px', width: '10px', height: '10px', cursor: 'sw-resize' } },
				{ name: 'se', style: { bottom: '-5px', right: '-5px', width: '10px', height: '10px', cursor: 'se-resize' } },
				{ name: 'n',  style: { top: '-5px', left: '5px', right: '5px', height: '10px', cursor: 'n-resize' } },
				{ name: 's',  style: { bottom: '-5px', left: '5px', right: '5px', height: '10px', cursor: 's-resize' } },
				{ name: 'w',  style: { left: '-5px', top: '5px', bottom: '5px', width: '10px', cursor: 'w-resize' } },
				{ name: 'e',  style: { right: '-5px', top: '5px', bottom: '5px', width: '10px', cursor: 'e-resize' } }
			];
			
			positions.forEach(pos => {
				const div = document.createElement('div');
				div.className = `bili-pip-resize-handle ${pos.name}`;
				div.style.cssText = `
					position: absolute;
					background: transparent;
					z-index: 2147483641;
					${Object.entries(pos.style).map(([k, v]) => `${k}: ${v};`).join('')}
				`;
				div.setAttribute('data-handle', pos.name);
				container.appendChild(div);
				handles[pos.name] = div;
			});
			return handles;
		}
		
		function addResizeHandles() {
			if (!state.videoContainer || state.handles) return;

			const container = state.videoContainer;
			const handles = createResizeHandles(container);

			// 全局鼠标松开监听函数
			state.globalMouseUpHandler = function onGlobalMouseUp(e) {
				if (e.button !== 0) return;
				state.isMouseDown = false;
				
				if (state.originalClickShrink) {
					setTimeout(() => {
						ConfigManager.PiP.clickOutsideToShrink = state.originalClickShrink;
					}, 350);
				}
			};
			
			document.addEventListener('mouseup', state.globalMouseUpHandler);

			const onResizeStart = (e) => {
					e.preventDefault();
					e.stopPropagation();
					
					// 临时覆盖 hover 样式，强制隐藏发送栏
					const style = document.createElement('style');
					style.id = 'bili-pip-temp-hide';
					style.textContent = `
						.bili-pip-mode:hover .bpx-player-sending-bar {
							opacity: 0 !important;
							visibility: hidden !important;
							height: 0 !important;
							min-height: 0 !important;
							margin: 0 !important;
							padding: 0 !important;
							width: 0 !important;
							max-width: 0 !important;
							min-width: 0 !important;
							pointer-events: none !important;
							transition: none !important;
						}
					`;
					document.head.appendChild(style);
					state.tempStyle = style;

					state.isMouseDown = true;
					const originalClickShrink = ConfigManager.PiP.clickOutsideToShrink;
					if (originalClickShrink) ConfigManager.PiP.clickOutsideToShrink = false;

					if (state.resizeTimeout) clearTimeout(state.resizeTimeout);
					state.isResizing = true;
					state.originalClickShrink = originalClickShrink;

					const startRect = container.getBoundingClientRect();
					const startWidth = startRect.width;
					const startHeight = startRect.height;
					const aspect = startWidth / startHeight;

					const videoCenterX = startRect.left + startRect.width / 2;
					const videoCenterY = startRect.top + startRect.height / 2;
					const startDirX = e.clientX > videoCenterX ? 'right' : 'left';
					const startDirY = e.clientY > videoCenterY ? 'bottom' : 'top';

					let anchorX, anchorY;
					if (state.isShrunk) {
						const minWidth = 250;
						const minHeight = minWidth / aspect;
						anchorX = window.innerWidth - 20 - minWidth / 2;
						anchorY = window.innerHeight - 20 - minHeight / 2;
					} else {
						anchorX = window.innerWidth / 2;
						anchorY = window.innerHeight / 2;
					}

					const startDist = Math.hypot(e.clientX - anchorX, e.clientY - anchorY);
					const baseDist = Math.max(startDist, 1);
					const originalTransition = container.style.transition;
					container.style.transition = 'none';

					function onMove(e) {
						e.preventDefault();
						e.stopPropagation();
						
						if (state.rafId) cancelAnimationFrame(state.rafId);
						state.rafId = requestAnimationFrame(() => {
							if ((e.clientX > videoCenterX) !== (startDirX === 'right') || 
								(e.clientY > videoCenterY) !== (startDirY === 'bottom')) {
								onUp(e);
								return;
							}

							const dx = e.clientX - anchorX;
							const dy = e.clientY - anchorY;
							const currentDistSq = dx * dx + dy * dy;
							const baseDistSq = baseDist * baseDist;
							const ratio = Math.sqrt(currentDistSq / baseDistSq);
							
							let scale = Math.min(ratio, 3.0);
							let newWidth = startWidth * scale;

							const minWidth = state.isShrunk ? 250 : 400;
							const maxWidth = state.isShrunk ? 800 : Math.min(window.innerWidth * 0.95, 7680);

							if (newWidth < minWidth) newWidth = minWidth;
							if (newWidth > maxWidth) newWidth = maxWidth;
							
							const aspect = getVideoAspectRatio(state.videoElement, state.videoContainer);
							container.style.width = newWidth + 'px';
							container.style.height = (newWidth / aspect) + 'px';
							
							state.rafId = null;
						});
					}
					
					function onUp(e) {
						container.style.transition = originalTransition;
						
						// 移除临时样式
						if (state.tempStyle) {
							state.tempStyle.remove();
							state.tempStyle = null;
						}
						
						state.isResizing = false;
						state.justResized = true;
						state.lastResizeEnd = Date.now();
						state.isMouseDown = false;

						if (state.rafId) {
							cancelAnimationFrame(state.rafId);
							state.rafId = null;
						}

						if (state.resizeTimeout) clearTimeout(state.resizeTimeout);
						state.resizeTimeout = setTimeout(() => {
							state.justResized = false;
							state.resizeTimeout = null;
						}, 1500);

						document.removeEventListener('mousemove', onMove);
						document.removeEventListener('mouseup', onUp);
						document.removeEventListener('mouseleave', onUp);
					}

					document.addEventListener('mousemove', onMove);
					document.addEventListener('mouseup', onUp);
					document.addEventListener('mouseleave', onUp);
				};

		Object.values(handles).forEach(handle => {
			handle.addEventListener('mousedown', onResizeStart);
		});

		state.handles = handles;
		}

        // -- 画中画核心启用与禁用 --
		function enable() {
			disable();
			if (state.enabled) return false;
			
			const container = document.querySelector(SELECTORS.videoContainer);
			
			if (!container) {
				setTimeout(() => {
					if (!state.enabled) enable();
				}, 800);
				return false;
			}
			
			state.videoContainer = container;
			state.videoElement = container.querySelector(SELECTORS.videoElement) || container.querySelector('video');
			
			if (!state.videoElement.videoWidth || !state.videoElement.videoHeight) {
				state.videoElement.addEventListener('loadedmetadata', () => {
					setTimeout(() => {
						if (!state.enabled) enable();
					}, 800);
				}, { once: true });
				return false;
			}

			// 记录原始位置
			state.originalContainer = container.parentNode;
			const marker = document.createElement('div');
			marker.id = 'bili-pip-position-marker-' + Date.now();
			marker.style.display = 'none';
			marker.setAttribute('data-bili-pip-marker', 'true');
			state.originalContainer.insertBefore(marker, state.originalContainer.firstChild);
			state.positionMarker = marker;

            document.body.appendChild(container);

            const pipPercent = Math.min(ConfigManager.PiP.pipSize, 100);
            const maxWidth = 7680;
            const baseWidth = Math.min(window.innerWidth * pipPercent / 100, maxWidth);
			let aspect = getVideoAspectRatio(state.videoElement, container);
            const baseHeight = baseWidth / aspect;

            const transition = ConfigManager.Other.performanceMode ? 'none' : 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
			const boxShadow = getBoxShadow();
			
            Object.assign(state.videoContainer.style, {
				position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: '2147483641',
                width: baseWidth + 'px',
                height: baseHeight + 'px',
                maxWidth: maxWidth + 'px',
                maxHeight: '95vh',
                borderRadius: '0',
                boxShadow: boxShadow,
                transition: transition
            });
			
			state.videoContainer.style.setProperty('box-shadow', boxShadow, 'important');
			
			// # 按钮类
			updateButtonAppearance();
			setTimeout(() => {
				if (state.button && state.button.isConnected) injectSizeButton();
				else setTimeout(injectSizeButton, 500);
			}, 100);
			
			// 全局关闭按钮
			if (!state.globalCloseButton) {
				const globalClose = document.createElement('div');
				globalClose.id = 'bili-pip-global-close';
				globalClose.innerHTML = '×';
				globalClose.style.cssText = `
					position: fixed;
					top: 20px;
					right: 20px;
					width: 32px;
					height: 32px;
					background: rgba(0, 0, 0, 0.6);
					color: white;
					border-radius: 50%;
					font-size: 26px;
					font-weight: bold;
					display: flex;
					align-items: center;
					justify-content: center;
					cursor: pointer;
					z-index: 2147483644;
					transition: opacity 0.2s ease, background 0.2s ease, transform 0.2s ease;
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
					line-height: 1;
					font-family: Arial, sans-serif;
					pointer-events: auto !important;
					opacity: 0;
				`;
				
				globalClose.addEventListener('click', (e) => {
					e.stopPropagation();
					disable();
				});
				
				globalClose.addEventListener('mouseenter', () => {
					globalClose.style.opacity = '1';
					globalClose.style.background = 'rgba(0, 0, 0, 0.8)';
					globalClose.style.transform = 'scale(1.1)';
				});
				
				globalClose.addEventListener('mouseleave', (e) => {
					globalClose.style.background = 'rgba(0, 0, 0, 0.4)';
					globalClose.style.transform = 'scale(1)';
					
					if (state.isShrunk) {
						globalClose.style.opacity = '1';
					} else {
						if (!state.videoContainer.contains(e.relatedTarget) &&
							!(state.commentPipContainer && state.commentPipContainer.contains(e.relatedTarget))) {
							globalClose.style.opacity = '0';
						}
					}
				});
				
				document.body.appendChild(globalClose);
				state.globalCloseButton = globalClose;
			}

			state.videoContainer.addEventListener('mouseenter', () => {
				if (state.globalCloseButton) {
					state.globalCloseButton.style.opacity = '1';
				}
			});

			state.videoContainer.addEventListener('mouseleave', (e) => {
				if (state.globalCloseButton && !state.isShrunk) {
					if (e.relatedTarget !== state.globalCloseButton) {
						state.globalCloseButton.style.opacity = '0';
					}
				}
			});
			
			// 画中画容器关闭按钮
			if (!state.closeButton && ConfigManager.Other.showPipContainerCloseButton) {
				const closeBtn = document.createElement('div');
				closeBtn.id = 'bili-pip-close-btn';
				closeBtn.innerHTML = '×';
				closeBtn.style.cssText = `
					position: absolute;
					top: 10px;
					right: 10px;
					width: 22px;
					height: 22px;
					color: red;
					font-size: 28px;
					font-weight: bold;
					border-radius: 50%;
					display: flex;
					align-items: center;
					justify-content: center;
					cursor: pointer;
					z-index: 2147483644;
					transition: ${ConfigManager.Other.performanceMode ? 'none' : 'opacity 0.2s ease'};
					opacity: 0;
					pointer-events: none;
				`;
				
				state.videoContainer.addEventListener('mouseenter', () => {
					if (state.closeButton) {
						state.closeButton.style.opacity = '1';
						state.closeButton.style.pointerEvents = 'auto';
					}
				});
				
				state.videoContainer.addEventListener('mouseleave', () => {
					if (state.closeButton) {
						state.closeButton.style.opacity = '0';
						state.closeButton.style.pointerEvents = 'none';
					}
				});
				
				closeBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					disable();
				});
				
				state.videoContainer.appendChild(closeBtn);
				state.videoContainer.style.position = 'relative';
				state.closeButton = closeBtn;
			}
			
            container.classList.add('bili-pip-mode');

            // # 处理视频元素
            if (state.videoElement) {
                state.videoElement.dataset.originalStyle = state.videoElement.style.cssText;
                Object.assign(state.videoElement.style, {
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                });
            }
			
			// # 防点击遮罩
			const clickMask = document.createElement('div');
			clickMask.id = 'bili-pip-click-mask';
			clickMask.style.cssText = `
				position: fixed;
				top: 0;
				left: 0;
				width: 100vw;
				height: 100vh;
				background: transparent;
				z-index: 2147483640;
				pointer-events: auto;
			`;
			document.body.appendChild(clickMask);
			state.clickMask = clickMask;
			
			state.videoContainer.style.pointerEvents = 'auto';

            // # 创建遮罩
            const overlay = document.createElement('div');
            overlay.className = 'bili-pip-overlay';
			
			document.body.appendChild(overlay);
			state.overlay = overlay;
			
            Object.assign(overlay.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                backgroundColor: getOverlayColor(ConfigManager.PiP.overlayOpacity),
                zIndex: '2147483636',
                pointerEvents: 'none',
                transition: ConfigManager.Other.performanceMode ? 'none' : 'all 0.5s ease'
            });
			
			const biliMainHeader = document.querySelector('#biliMainHeader');
			if (biliMainHeader) biliMainHeader.style.opacity = 0;
			
			setTimeout(() => {
				if (state.overlay) {
					updateBlurMode();
				}
            }, 20);
			
			if (ConfigManager.PiP.effectMode !== 'none') {
				setTimeout(() => {
					initCanvas(ConfigManager.PiP.effectMode);
					EffectPlaybackManager.initVideoListeners();
				}, 500);
			}
			
			if (ConfigManager.Auto.pipEnterAutoPlay && state.videoElement) {
				if (state.videoElement.paused) {
					setTimeout(() => { 
						state.videoElement.play().catch(() => {}); 
					}, 100);
				}
			}
			
            state.enabled = true;
            state.isShrunk = false;
			state.justEnabled = true;
			
			updateScrollbarVisibility();
			setTimeout(() => { state.justEnabled = false; }, 2000);
			
            // # 绑定事件监听
            bindEvents();
			addResizeHandles();
			if (ConfigManager.PiP.shrinkOnScrollDown || ConfigManager.PiP.restoreOnScrollUp) initScrollListener();
			if (ConfigManager.Auto.pipEnterFullscreen) AutoFullscreenManager.requestFullscreen(document.documentElement);
			
            return true;
        }

		function disable() {
			if (!state.enabled) return;			

			const videoContainer = state.videoContainer;
			const originalContainer = state.originalContainer;
			const videoElement = state.videoElement;
			const positionMarker = state.positionMarker;
			
			// # 按钮类
			if (state.sizeButton && state.sizeButton.isConnected) {
				const nextSibling = state.sizeButton.nextSibling;
				if (nextSibling && nextSibling.style?.cssText?.includes('width: 8px')) {
					nextSibling.remove();
				}
				state.sizeButton.remove();
				state.sizeButton = null;
			}
			
			if (state.closeButton) {
				state.closeButton.remove();
				state.closeButton = null;
			}
			
			if(state.globalCloseButton){
				state.globalCloseButton.remove();
				state.globalCloseButton = null;
			}
			
			updateButtonAppearance();

			// # 清理评论区
			if (state.commentPipContainer) {
				const container = state.commentPipContainer;
				
				if (container._previewObserver) {
					container._previewObserver.disconnect();
				}
				container.remove();
				state.commentPipContainer = null;
			}
			
			// # 关闭遮罩与动态特效类
			if (state.overlay) {
				state.overlay.style.backgroundColor = 'rgba(10,10,10,0)';
				if (state.overlay && state.overlay.parentNode) {
					state.overlay.parentNode.removeChild(state.overlay);
					state.overlay = null;
				}
			}
			
			if (state.coverBlurLayer) {
				state.coverBlurLayer.remove();
				state.coverBlurLayer = null;
			} else {
				const backgroundContent = document.querySelector(SELECTORS.backgroundContent);
				if (backgroundContent) backgroundContent.style.filter = 'none';
			}
			
			const biliMainHeader = document.querySelector('#biliMainHeader');
			if (biliMainHeader) biliMainHeader.style.opacity = 1;

			cleanupCanvas();
			EffectPlaybackManager.cleanupVideoListeners();
			
			if (state.clickMask) {
				state.clickMask.remove();
				state.clickMask = null;
			}

			// # 恢复视频容器到原位置
			if (videoContainer && originalContainer && document.body.contains(originalContainer)) {
				videoContainer.style.cssText = '';
				
				if (positionMarker && positionMarker.parentNode === originalContainer) {
					if (positionMarker.nextSibling) {
						originalContainer.insertBefore(videoContainer, positionMarker.nextSibling);
					} else {
						originalContainer.appendChild(videoContainer);
					}
					positionMarker.remove();
				} else {
					originalContainer.appendChild(videoContainer);
				}

				void videoContainer.offsetHeight;
			} else {
				const fallback = document.querySelector(SELECTORS.fallbackContainer);
				if (fallback) fallback.appendChild(videoContainer);
			}
			
			// # 其他
			if (ConfigManager.Auto.pipExitAutoPause && videoElement) {
				if (!state.videoElement.paused) {
					state.videoElement.pause();
				}
			}
			
			if (ConfigManager.Auto.pipExitFullscreen && !globalState.isUrlChange) {
				AutoFullscreenManager.exitFullscreen();
			}
			
			unbindEvents();

			if (state.handles) {
				Object.values(state.handles).forEach(h => h.remove());
				state.handles = null;
			}
			
			setTimeout(() => {
				updateScrollbarVisibility();
			}, 50);
			
			performPipExitPosition();
			
			// # 重置状态
			if (videoContainer) {
				videoContainer.classList.remove('bili-pip-mode');
				videoContainer.classList.remove('shrunk');
			}
			
			state.videoContainer = null;
			state.originalContainer = null;
			state.isShrunk = false;
			state.isShrunkByClick = false;
			state.enabled = false;
			state.positionMarker = null;
		}

        // -- 事件绑定与解绑 --
        function bindEvents() {
            // 点击外部缩小
			state.clickOutsideHandler = handleDocumentClick;
			document.addEventListener('click', state.clickOutsideHandler, true);

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
			// 如果鼠标左键还按着，绝对忽略点击
			if (state.isMouseDown) return;
			
			// 正在拖拽或拖拽刚结束时忽略点击
			if (state.isResizing || state.justResized || (state.lastResizeEnd && Date.now() - state.lastResizeEnd < 300)) return;

			// 如果是在拖柄上发生的点击，也忽略
			if (e.target.closest('.bili-pip-resize-handle')) return;
			
			// 如果点击的是弹幕相关元素，忽略
			if (e.target.closest('.bpx-player-dm-root') ||
				e.target.closest('.bpx-player-dm-send') ||
				e.target.closest('.bpx-player-dm-input') ||
				e.target.closest('[class*="danmaku"]') ||
				e.target.closest('[class*="弹幕"]')) {
				return;
			}
			
			if (e.target.closest('.bili-pip-size-btn')) {
				return;
			}

			if (!state.enabled || !state.videoContainer) return;
			
			const inside = state.videoContainer.contains(e.target);
		
			if (ConfigManager.PiP.clickOutsideToShrink && !inside) {
				shrinkToCorner(true);
			}
		}
        
        function handleFullscreenClick(e) {
            if (!state.enabled) return;
            const isWebFull = e.target.closest(SELECTORS.webFullscreenButton);
			if (isWebFull) {
				disable(); 
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

        // -- 画中画滚动缩小与恢复 --
        function initScrollListener() {
			if (state.scrollHandler) return;
			
			let lastScrollY = window.scrollY;
			let lastDirTime = Date.now();
			let downAccum = 0;
			let upAccum = 0;

			state.scrollHandler = function() {
				if (!state.enabled || state.justEnabled) return;

				const currentY = window.scrollY;
				const delta = currentY - lastScrollY;
				const now = Date.now();

				if (Math.abs(delta) < 20) {
					lastScrollY = currentY;
					return;
				}

				const dir = delta > 0 ? 'down' : 'up';
				
				// 方向变化或超时重置
				if (now - lastDirTime > 800) {
					downAccum = 0;
					upAccum = 0;
				}
				
				// 累积距离
				if (dir === 'down') {
					downAccum += Math.abs(delta);
					upAccum = 0;
				} else {
					upAccum += Math.abs(delta);
					downAccum = 0;
				}

				lastDirTime = now;
				
				if (currentY <= 10 && state.isShrunk) {
					expandToCenter();
					downAccum = upAccum = 0;
					lastScrollY = currentY;
					return;
				}
				
				if (ConfigManager.PiP.shrinkOnScrollDown && !state.isShrunk && dir === 'down') {
					if (downAccum >= ConfigManager.PiP.shrinkDownDistance) {
						shrinkToCorner();
						downAccum = upAccum = 0;
					}
				}
				
				if (ConfigManager.PiP.restoreOnScrollUp && state.isShrunk && dir === 'up') {
					if (upAccum >= ConfigManager.PiP.restoreUpDistance) {
						expandToCenter();
						downAccum = upAccum = 0;
					}
				}

				lastScrollY = currentY;
			};

			window.addEventListener('scroll', state.scrollHandler, { passive: true });
		}
		
		function shrinkToCorner(byClick = false) {
			if (!state.videoContainer || state.isShrunk) return;
			
			const onTransitionEnd = () => {
				state.videoContainer.style.willChange = '';
				state.videoContainer.removeEventListener('transitionend', onTransitionEnd);
			};
			state.videoContainer.addEventListener('transitionend', onTransitionEnd);
			
			state.isShrunk = true;
			state.isShrunkByClick = byClick;
			
			const size = ConfigManager.PiP.shrunkSize;
			const aspect = getVideoAspectRatio(state.videoElement, state.videoContainer);
			const height = size / aspect;
			const transition = ConfigManager.Other.performanceMode ? 'none' : 'width 0.42s ease, height 0.3s ease, right 0.4s ease, bottom 0.4s ease';
			const boxShadow = getBoxShadow();
			
			state.videoContainer.style.transition = transition;
			state.videoContainer.style.width = size + 'px';
			state.videoContainer.style.height = height + 'px';
			state.videoContainer.style.top = 'auto';
			state.videoContainer.style.bottom = '10px';
			state.videoContainer.style.right = '10px';
			state.videoContainer.style.left = 'auto';
			state.videoContainer.style.transform = 'none';
			state.videoContainer.style.borderRadius = '0';
			state.videoContainer.style.cursor = 'pointer';
			state.videoContainer.style.zIndex = '2147483641';
			state.videoContainer.style.boxShadow = boxShadow;
			state.videoContainer.style.setProperty('box-shadow', boxShadow, 'important');
			state.videoContainer.classList.add('shrunk');
			
			if (state.clickMask) {
				state.clickMask.remove();
				state.clickMask = null;
			}
			
			if (state.globalCloseButton) {
				state.globalCloseButton.style.opacity = '1';
			}
			
			updateBlurMode();
			
			EffectPlaybackManager.updateEffectState();
			const colorConfig = ParticlePool.getColorConfig();
			state.particlePool.updateColors(colorConfig);
			updateButtonAppearance();
		}
		
        function expandToCenter() {
            if (!state.videoContainer || !state.isShrunk) return;
			
			const onTransitionEnd = () => {
				state.videoContainer.style.willChange = '';
				state.videoContainer.removeEventListener('transitionend', onTransitionEnd);
			};
			state.videoContainer.addEventListener('transitionend', onTransitionEnd);
			
			state.isShrunk = false;
            state.isShrunkByClick = false;
			
            const pipPercent = Math.min(ConfigManager.PiP.pipSize, 100);
            const maxWidth = 7680;
            const baseWidth = Math.min(window.innerWidth * pipPercent / 100, maxWidth);
            const aspect = getVideoAspectRatio(state.videoElement, state.videoContainer);
            const baseHeight = baseWidth / aspect;
			const transition = ConfigManager.Other.performanceMode ? 'none' : 'transform 0.6s cubic-bezier(0.2, 0.9, 0.4, 1.12)';
			const boxShadow = getBoxShadow();
			
			state.videoContainer.style.width = baseWidth + 'px';
			state.videoContainer.style.height = baseHeight + 'px';
			state.videoContainer.style.top = '50%';
			state.videoContainer.style.left = '50%';
			state.videoContainer.style.bottom = 'auto';
			state.videoContainer.style.right = 'auto';
			state.videoContainer.style.borderRadius = '0';
			state.videoContainer.style.cursor = 'default';
			state.videoContainer.style.zIndex = '2147483641';
			state.videoContainer.style.transition = transition;
			state.videoContainer.style.transform = 'translate(-50%, -50%)';
			state.videoContainer.style.boxShadow = boxShadow;
			state.videoContainer.style.setProperty('box-shadow', boxShadow, 'important');
			state.videoContainer.classList.remove('shrunk');	

			if (!state.clickMask) {
				const clickMask = document.createElement('div');
				clickMask.id = 'bili-pip-click-mask';
				clickMask.style.cssText = `
					position: fixed;
					top: 0;
					left: 0;
					width: 100vw;
					height: 100vh;
					background: transparent;
					z-index: 2147483640;
					pointer-events: auto;
				`;
				document.body.appendChild(clickMask);
				state.clickMask = clickMask;
				state.videoContainer.style.pointerEvents = 'auto';
			}
			
			if (state.globalCloseButton) {
				if (!state.videoContainer.matches(':hover') &&
					!(state.commentPipContainer && state.commentPipContainer.matches(':hover'))) {
					state.globalCloseButton.style.opacity = '0';
				}
			}
			
			updateBlurMode();
		
            if (state.restoreClickHandler) {
                state.videoContainer.removeEventListener('click', state.restoreClickHandler);
                state.restoreClickHandler = null;
            }
			
			if (state.handles) {
				Object.values(state.handles).forEach(h => h.style.display = '');
			}
				
			EffectPlaybackManager.updateEffectState();
			const colorConfig = ParticlePool.getColorConfig();
			state.particlePool.updateColors(colorConfig);
			updateButtonAppearance();
        }
		
		// - 退出画中画的定位 - 
		function performPipExitPosition() {
			setTimeout(() => { if (ConfigManager.PiP.pipVerticalEnabled) performExitScroll(); }, 150);
			setTimeout(() => { if (ConfigManager.PiP.pipHorizontalEnabled) PagePositionSystem.centerPage(); }, 450);
		}
		
		function performExitScroll() {	
			const hasCommentPip = ConfigManager.PiP.blurMode === 'pip-comment-mode';
			
			const targetY = PagePositionSystem.getTargetY();
			if (!targetY) return;
			const currentY = window.scrollY;
			const distance = Math.abs(targetY - currentY);
			
			
			if (ConfigManager.Other.performanceMode) {
				window.scrollTo({
					top: targetY,
					behavior: 'smooth'
				});
			} else {
				if (!hasCommentPip) {
					const duration = Math.ceil(distance / 1000) * 35;
					if (distance > 10000) {
						window.scrollTo({
							top: targetY,
							behavior: 'smooth'
						});
					} else {
						smoothScrollTo(targetY, duration);
					}
				} else {
					window.scrollTo({
						top: targetY,
						behavior: 'smooth'
					});
				}
			}
		}
		
		// -- 遮罩、模糊、阴影 --
		function getBoxShadow() {
			if (ConfigManager.Other.performanceMode) return 'none';
			
			const mode = ConfigManager.PiP.overlayMode;
			const op = ConfigManager.PiP.overlayOpacity;
			
			const bgColorStr = getBackgroundColor();
			const rgb = bgColorStr.split(',').map(Number);
			const isWhiteBg = rgb[0] > 200 && rgb[1] > 200 && rgb[2] > 200;
			const isBlackMask = ConfigManager.PiP.overlayMode === 'black';
			
			const shadowSize = (!isWhiteBg && !state.isShrunk) 
				? '0 0 25px' 
				: (state.isShrunk ? '0 4px 20px' : '0 8px 40px');
			const color = 255 * Math.pow(op, 2);
			const alpha = 1 - 0.7 * op ;
			
			if (isWhiteBg && isBlackMask) return `${shadowSize} rgba(${color}, ${color}, ${color}, ${alpha})`;
			if (!isWhiteBg) return `${shadowSize} rgba(255, 255, 255, 0.3)`;
			
			return `${shadowSize} rgba(0, 0, 0, 0.8)`;
		}
		
		function getVideoCoverUrl() {
			const shareImg = document.querySelector('#wxwork-share-pic');
			if (shareImg && shareImg.src) {
				let url = shareImg.src;
				url = url.replace(/@\.\w+$/, '');
				if (url.startsWith('//')) url = 'https:' + url;
				return url;
			}
			
			const video = state.videoElement;
			if (video && video.poster) return video.poster;
			
			const coverSelectors = [
				'.bpx-player-video-preview img',
				'.bpx-player-video-preview',
				'.video-preview',
				'[class*="cover"] img',
				'.bili-video-card__cover-img',
			];
			for (const sel of coverSelectors) {
				const el = document.querySelector(sel);
				if (el) {
					const src = el.src || el.style.backgroundImage?.match(/url\(["']?(.+?)["']?\)/)?.[1];
					if (src) return src;
				}
			}
			
			if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.videoData) {
				const pic = window.__INITIAL_STATE__.videoData.pic;
				if (pic) return pic;
			}
			
			return null;
		}
		
		function updateBlurMode() {
			if (!state.overlay) return;
			
			const blurMode = ConfigManager.PiP.blurMode;
			const blurStrength = ConfigManager.PiP.blurStrength;
			const isShrunk = state.isShrunk || false;
			const performanceMode = ConfigManager.Other.performanceMode;
			const overlayOpacity = state.isShrunk ? ConfigManager.PiP.shrunkOverlayOpacity : ConfigManager.PiP.overlayOpacity;

			let shouldBlur = false;
			if (performanceMode) shouldBlur = false;
			if (blurMode === 'pip-only') shouldBlur = !isShrunk;
			else if (blurMode === 'pip-comment-mode') shouldBlur = true;
			else if (blurMode === 'none' || blurStrength <= 0 ) shouldBlur = false;
			
			if (overlayOpacity == 1) shouldBlur = false;
			
			let finalBlur = 'none';
			finalBlur = shouldBlur ? `blur(${blurStrength}px)` : 'none';
				
			if (isShrunk) {
				if (blurMode === 'pip-comment-mode') {
					if (performanceMode) {
						state.overlay.style.backgroundColor = getOverlayColor(1);
					} else {
						state.overlay.style.backgroundColor = getOverlayColor(Math.max(ConfigManager.PiP.shrunkOverlayOpacity, 0.5));
						finalBlur = `blur(${Math.max(blurStrength, 15)}px)`;
					}
				} else {
					state.overlay.style.backgroundColor = getOverlayColor(ConfigManager.PiP.shrunkOverlayOpacity);
				}
			} else {
				state.overlay.style.backgroundColor = getOverlayColor(ConfigManager.PiP.overlayOpacity);
			}
			
			if (ConfigManager.PiP.useCoverForBlur) {
				if (!state.enabled) return;
			
				const blurStrength = ConfigManager.PiP.blurStrength;
				const isShrunk = state.isShrunk;
				
				let coverUrl = getVideoCoverUrl();
				if (!coverUrl) {
					if (state.coverBlurLayer) state.coverBlurLayer.remove();
					state.coverBlurLayer = null;
					return;
				}
				
				if (state.coverBlurLayer) state.coverBlurLayer.remove();
				
				const scaleBase = shouldBlur ? Math.max(1 + (0.01 * blurStrength * 1.25), 1.0) : 1;

				const layer = document.createElement('div');
				layer.id = 'bili-pip-cover-blur';
				layer.style.cssText = `
					position: fixed;
					top: 0;
					left: 0;
					width: 100vw;
					height: 100vh;
					transform: scale(${scaleBase});
					background-image: url(${coverUrl});
					background-size: cover;
					background-position: center;
					opacity: 1;
					z-index: 2147483635;
					pointer-events: none;
				`;
				
				document.body.appendChild(layer);
				
				state.coverBlurLayer = layer;
				state.currentCoverUrl = coverUrl;
				if (state.coverBlurLayer) state.coverBlurLayer.style.filter =  finalBlur;
				
				if (isShrunk && blurMode !== 'pip-comment-mode') {
					if (state.coverBlurLayer) state.coverBlurLayer.style.opacity =  0;
				} else if (isShrunk && blurMode === 'pip-comment-mode') {
					const scaleA = Math.max(scaleBase, 1.2);
					state.coverBlurLayer.style.transform = `scale(${scaleA})`;
				} else if (state.coverBlurLayer) {
					state.coverBlurLayer.style.transform = `scale(${scaleBase})`;
					state.coverBlurLayer.style.opacity =  1;
				}
				
			} else {
				const backgroundContent = document.querySelector(SELECTORS.backgroundContent);
				if (backgroundContent) backgroundContent.style.filter = finalBlur;

			}
			
			if (blurMode === 'pip-comment-mode' && isShrunk) {
				if (!state.commentPipContainer) {
					createCommentPip();
				}

				const container = state.commentPipContainer;
				if (container) {
					const originalComment = container._originalComment;
					
					// 检查是否已经克隆过
					let clonedComment = container.querySelector('[data-cloned="true"]');
					
					// 如果没有克隆过，则克隆评论区
					if (!clonedComment && originalComment) {
						const contentContainer = container.querySelector('.bili-comment-scroll-container');
						if (contentContainer) {
							// 克隆整个评论区元素
							clonedComment = originalComment.cloneNode(true);
							clonedComment.setAttribute('data-cloned', 'true');
							contentContainer.appendChild(clonedComment);
						}
					}
					// 显示容器（不隐藏原评论区）
					container.style.display = 'flex';
				}
			} else {
				// 隐藏评论区悬浮窗
				if (state.commentPipContainer) {
					const container = state.commentPipContainer;
					// 直接隐藏容器，不移回原评论区
					container.style.display = 'none';
				}
			}
		}

		// -- 悬浮评论区 --
		function createCommentPip() {
			if (state.commentPipContainer) {
				return state.commentPipContainer;
			}
			
			const originalComment = document.querySelector('div.left-container.scroll-sticky > div > bili-comments') ||
									document.querySelector('bili-comments') ||
									document.querySelector('#commentapp') ||
									document.querySelector('.bili-comments');
			if (!originalComment) return null;

			const container = document.createElement('div');
			container.id = 'bili-comment-pip';
			
			const bgColorStr = getBackgroundColor();
			const rgb = bgColorStr.split(',').map(Number);
			const isWhiteBg = rgb[0] > 200 && rgb[1] > 200 && rgb[2] > 200;
			const isBlackMask = ConfigManager.PiP.overlayMode === 'black';
			
			let bgColor, opacity;
			if (isWhiteBg && isBlackMask) { bgColor = '220, 220, 220'; opacity = 0.85; }
			if (isWhiteBg && !isBlackMask) { bgColor = '250, 250, 250'; opacity = 0.85; }
			if (!isWhiteBg) { bgColor = '17, 17, 17'; opacity = 0.75; }
		
			container.style.cssText = `
				position: fixed;
				top: 30px;
				left: 40px;
				bottom: 30px;
				width: 75vw;
				
				padding-top: 30px;
				padding-right: 50px;
				padding-bottom: 30px;
				padding-left: 50px;
				
				background: rgba(${bgColor}, ${opacity}) !important;
				border-radius: 40px / 36px;
				box-shadow: 0 10px 25px rgba(0,0,0,0.2), 0 2px 5px rgba(0,0,0,0.1);
				
				z-index: 2147483638;
				display: flex;
				flex-direction: column;
				overflow: hidden;
				pointer-events: auto;
			`;

			// 保存原始父容器和评论区元素
			container._originalParent = originalComment.parentNode;
			container._originalComment = originalComment;

			// 内容容器
			const contentContainer = document.createElement('div');
			contentContainer.className = 'bili-comment-scroll-container';
			contentContainer.style.cssText = `
				flex: 1;
				overflow-y: auto;
				overflow-x: hidden;
				padding: 0;
				background: transparent;
				scrollbar-width: none;
				-ms-overflow-style: none;
			`;
			container.appendChild(contentContainer);

			// 查找并分离发布框
			let publishBox = null;
			function findPublishBox(element) {
				if (!element) return null;
				if (element.shadowRoot) {
					const shadow = element.shadowRoot;
					const textarea = shadow.querySelector('textarea');
					if (textarea) {
						return textarea.closest('div[class*="publish"], div[class*="reply"], div[class*="box"]');
					}
				}
				const textarea = element.querySelector('textarea');
				if (textarea) {
					return textarea.closest('div[class*="publish"], div[class*="reply"], div[class*="box"]');
				}
				return null;
			}

			publishBox = findPublishBox(originalComment);
			if (publishBox) {
				const fixedPublishBox = document.createElement('div');
				fixedPublishBox.style.cssText = `
					flex-shrink: 0;
					background: transparent;
					padding: 12px;
					z-index: 10;
				`;
				fixedPublishBox.appendChild(publishBox);
				container.appendChild(fixedPublishBox);
			}

			const style = document.createElement('style');
			style.id = 'bili-comment-pip-styles';
			style.textContent = `
				/* 滚动条隐藏 */
				.bili-comment-scroll-container::-webkit-scrollbar {
					display: none !important;
					width: 0 !important;
					height: 0 !important;
					background: transparent !important;
					-webkit-appearance: none !important;
				}
				
				.bili-comment-scroll-container {
					scrollbar-width: none !important;
					-ms-overflow-style: none !important;
				}
				
				/* 背景透明 */
				#bili-comment-pip,
				#bili-comment-pip * {
					background-color: transparent !important;
				}
				
				/* 分隔线隐藏 */
				#bili-comment-pip hr,
				#bili-comment-pip [class*="divider"],
				#bili-comment-pip [class*="split"],
				#bili-comment-pip [class*="separator"],
				#bili-comment-pip [class*="border"],
				#bili-comment-pip [class*="分割线"],
				#bili-comment-pip .bpx-comment-divider,
				#bili-comment-pip .comment-divider,
				#bili-comment-pip .reply-divider,
				#bili-comment-pip .bili-comment-divider,
				#bili-comment-pip .bpx-comment-split,
				#bili-comment-pip .comment-split,
				#bili-comment-pip [class*="publish"] [class*="border"],
				#bili-comment-pip [class*="publish"] [class*="divider"],
				#bili-comment-pip [class*="reply"] [class*="border"],
				#bili-comment-pip [class*="reply"] [class*="divider"],
				#bili-comment-pip [class*="header"] [class*="border"],
				#bili-comment-pip [class*="footer"] [class*="border"],
				#bili-comment-pip [class*="header"] [class*="divider"],
				#bili-comment-pip [class*="footer"] [class*="divider"],
				#bili-comment-pip .bpx-comment-item:not(:last-child)::after,
				#bili-comment-pip .comment-item:not(:last-child)::after,
				#bili-comment-pip .reply-item:not(:last-child)::after,
				#bili-comment-pip [class*="border-top"],
				#bili-comment-pip [class*="border-bottom"],
				#bili-comment-pip [class*="border-left"],
				#bili-comment-pip [class*="border-right"] {
					display: none !important;
					opacity: 0 !important;
					visibility: hidden !important;
					height: 0 !important;
					width: 0 !important;
					border: none !important;
					outline: none !important;
					box-shadow: none !important;
					background: transparent !important;
					border-image: none !important;
				}
				
				/* 移除所有边框 */
				#bili-comment-pip * {
					border-color: transparent !important;
					border-top-color: transparent !important;
					border-bottom-color: transparent !important;
					border-left-color: transparent !important;
					border-right-color: transparent !important;
					outline-color: transparent !important;
				}
			`;
			container.appendChild(style);

			// 创建 MutationObserver	
			const previewObserver = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					mutation.addedNodes.forEach((node) => {
						if (node.nodeType === 1) {
							const className = node.className || '';
							// 排除 B站推荐视频元素
							if (className.includes('bpx-player-ending')) {
								return;
							}
							
							const isPreview = /preview|modal|dialog|popup|layer|image-viewer|viewer|lightbox/i.test(className) ||
											 (node.tagName === 'DIV' && node.querySelector('img'));
							if (isPreview) {
								node.style.zIndex = '2147483647';
								node.style.position = 'fixed';
								const allElements = node.querySelectorAll('*');
								allElements.forEach(el => {
									if (window.getComputedStyle(el).position === 'fixed') {
										el.style.zIndex = '2147483647';
									}
								});
								const closeBtns = node.querySelectorAll('[class*="close"], button, [class*="close-btn"]');
								closeBtns.forEach(btn => {
									btn.style.pointerEvents = 'auto';
									btn.style.cursor = 'pointer';
									btn.style.zIndex = '2147483648';
								});
								const masks = node.querySelectorAll('[class*="mask"]');
								masks.forEach(mask => {
									mask.style.zIndex = '2147483646';
								});
							}
						}
					});
				});
			});
			previewObserver.observe(document.body, { childList: true, subtree: true });
			container._previewObserver = previewObserver;
			
			document.body.appendChild(container);
			state.commentPipContainer = container;
			return container;
		}
		
		// -- 动态特效类 --
		// - 粒子特效管理器 -
		class ParticlePool {
			static getParticleCount(effectType) {
				const baseCount = {
					'lowest': 100,
					'low': 150,
					'medium': 200,
					'high': 250,
					'highest': 300
				}[ConfigManager.PiP.particleCount] || 150;

				let multiplier = 1;
				if (effectType === 'star') multiplier = 0.8;
				else if (effectType === 'rain') multiplier = 0.65;
				else if (effectType === 'orb') multiplier = 0.05;
				else if (effectType === 'meteor') multiplier = 0.42;

				let adjustedBase = baseCount * multiplier;
				
				const dynamicEnabled = ConfigManager.PiP.dynamicParticleCount;
				
				if (dynamicEnabled) {
					const scale = window.devicePixelRatio || 1;
					const realWidth = window.innerWidth * scale;
					const realHeight = window.innerHeight * scale;
					const realPixels = realWidth * realHeight;

					const thresholds = [
						{ pixels: 2000000, factor: 1.0 },
						{ pixels: 3500000, factor: 0.8 },
						{ pixels: 5000000, factor: 0.7 },
						{ pixels: 8000000, factor: 0.5 },
						{ pixels: 12000000, factor: 0.24 }
					];

					let factor = thresholds[0].factor;
					for (let i = 0; i < thresholds.length; i++) {
						if (realPixels > thresholds[i].pixels) factor = thresholds[i].factor;
						else break;
					}

					factor = Math.max(0.1, Math.min(1.0, factor));
					adjustedBase = adjustedBase * factor;
				}
				
				return Math.floor(adjustedBase);
			}
			
			static cachedRainAngle = null;
			static cachedOrbType = null;
			static cachedMeteor = null;

			static getParticleTypeConfig(effectType) {
				
				if (effectType === "rain") {
					if (ParticlePool.cachedRainAngle) {
						return ParticlePool.cachedRainAngle;
					}
					
					const ANGLES = [0.08, -0.08, 0.16, -0.16];
					const RANDOM_ANGLE = ANGLES[Math.floor(Math.random() * 4)];
					const SIN_ANGLE = Math.sin(RANDOM_ANGLE);
					const COS_ANGLE = Math.cos(RANDOM_ANGLE);
					
					ParticlePool.cachedRainAngle = { SIN_ANGLE, COS_ANGLE, DIR_X: -SIN_ANGLE, DIR_Y: -COS_ANGLE };
					return ParticlePool.cachedRainAngle;
				}
				
				if (effectType === "orb") {
					if (ParticlePool.cachedOrbType !== null) {
						return ParticlePool.cachedOrbType;
					}
					
					ParticlePool.cachedOrbType = Math.floor(Math.random() * 2);
					return ParticlePool.cachedOrbType;
				}
				
				if (effectType === "meteor") {
					if (ParticlePool.cachedMeteor !== null) {
						return ParticlePool.cachedMeteor;
					}
					
					const MeteorType = Math.floor(Math.random() * 2);
					const RANDOM_ANGLE = 0.75 + Math.random() * 0.75;
					
					ParticlePool.cachedMeteor = { MeteorType, RANDOM_ANGLE};
					return ParticlePool.cachedMeteor;
				}
				
				return null;
			}

			static getColorConfig() {
				const mode = ConfigManager.PiP.overlayMode;
				const op = state.isShrunk ? ConfigManager.PiP.shrunkOverlayOpacity : ConfigManager.PiP.overlayOpacity;
				
				const bgColorStr = getBackgroundColor();
				const rgb = bgColorStr.split(',').map(Number);
				const brightness = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114);
				
				const isCover = state.coverBlurLayer;
				const isAdaptive = (mode === 'adaptive');
				const isBlack = (mode === 'black');	
				
				const DarkType = Math.floor(Math.random() * 2);
				
				const T = {
					a: 1 - 0.2 * op,
					b: op,
					c: 0.3 + 0.5 * op,
					d: 1 - op,
					e: 0.7 + 0.3 * op,
				};
				
				const lightConfig = {
					star: { hueRange: [150, 360], saturationRange: [70, 90], lightnessRange: [60, 80], sizeMultiplier: 1.4, lineOpacity: 1 },
					rain: { color: [170 * T.a, 204 * T.a, 255 * T.a], opacityRange: [0.35, 0.65], sizeMultiplier: 1.3 },
					orb: { hueRange: [60, 360], saturationRange: [50 + 20 * T.b, 70 + 20 * T.b], lightnessRange: [50 + 20 * T.b, 70 + 20 * T.b], outerAlpha: 0, sizeMultiplier: 1.1 },
					meteor: { sizeMultiplier: 1.2 },
					borderlight: { hueRange: [90, 360]}
				};
				
				const neutralConfig = {
					star: { hueRange: [30 + 50 * T.d, 150 + 210 * T.d], saturationRange: [35 + 40 * T.b, 55 + 40 * T.b], lightnessRange: [35 + 30 * T.b, 55 + 30 * T.b], sizeMultiplier: 1.2, lineOpacity: 1 },
					rain: { color: [170 * T.e, 204 * T.e, 255 * T.e], opacityRange: [0.55 * T.c, 0.85 * T.c], sizeMultiplier: 1.3 },
					orb: { hueRange: [0, 360], saturationRange: [50 + 20 * T.b, 70 + 20 * T.b], lightnessRange: [50 + 20 * T.b, 70 + 20 * T.b], outerAlpha: 0.15, sizeMultiplier: 1.05 },
					meteor: { sizeMultiplier: 1.1 },
					borderlight: { hueRange: [90, 360]}
				};
						
				const darkConfig = {
					star: DarkType == 0 
						? { hueRange: [30, 60], saturationRange: [80, 100], lightnessRange: [70, 90], sizeMultiplier: 1.0, lineOpacity: 0 }
						: { hueRange: [30, 295], saturationRange: [80, 100], lightnessRange: [70, 90], sizeMultiplier: 1.0, lineOpacity: 0 },
					rain: DarkType == 0 
						? { color: [170, 204, 255], opacityRange: [0.35, 0.55], sizeMultiplier: 1.0 }
						: { color: [215, 215, 255], opacityRange: [0.15, 0.45], sizeMultiplier: 1.0 },
					orb: DarkType == 0
						? { hueRange: [35, 95], saturationRange: [70, 90], lightnessRange: [70, 100], outerAlpha: 0.25, sizeMultiplier: 1.0 }
						: { hueRange: [35, 330], saturationRange: [70, 90], lightnessRange: [70, 100], outerAlpha: 0.25, sizeMultiplier: 1.0 },
					meteor: { sizeMultiplier: 1 },
					borderlight: { hueRange: [0, 360] }
				};
				
				if (!isCover && op <= 0.2 && brightness > 200) return lightConfig;
				if (isAdaptive && op >= 0.9 && brightness > 200) return lightConfig;
				if (isBlack && op >= 0.9) return darkConfig;
				if (isCover && isAdaptive && brightness > 200) return neutralConfig;
				if (isBlack && brightness > 200) return neutralConfig;

				if (brightness <= 80) return darkConfig;
				if (brightness < 200) return neutralConfig;

				return lightConfig;
			}
			
			updateColors(colorConfig) {
				const config = colorConfig[this.effectType];
				if (!config) return;
				
				if (state.particlePool) {
					this.activeParticles.forEach(p => {
						if (this.effectType === 'star') {
							p.hue = Math.random() * (config.hueRange[1] - config.hueRange[0]) + config.hueRange[0];
							p.saturation = Math.random() * (config.saturationRange[1] - config.saturationRange[0]) + config.saturationRange[0];
							p.lightness = Math.random() * (config.lightnessRange[1] - config.lightnessRange[0]) + config.lightnessRange[0];
							p.size = (Math.random() * 0.8 + 0.5) * (config.sizeMultiplier || 1);
							p.lineOpacity = config.lineOpacity;
						} else if (this.effectType === 'rain') {
							p.color = config.color;
							p.opacity = Math.random() * (config.opacityRange[1] - config.opacityRange[0]) + config.opacityRange[0];
						} else if (this.effectType === 'orb') {
							const hue = Math.random() * (config.hueRange[1] - config.hueRange[0]) + config.hueRange[0];
							const saturation = Math.random() * (config.saturationRange[1] - config.saturationRange[0]) + config.saturationRange[0];
							const lightness = Math.random() * (config.lightnessRange[1] - config.lightnessRange[0]) + config.lightnessRange[0];
							p.baseColor = { h: hue, s: saturation, l: lightness };
							p.radius = 100 + Math.random() * 60 * (config.sizeMultiplier || 1);
						}
					});
				}
			}
			
			static getSpeedCompensation() {
				const fps = ConfigManager.PiP.frameRate || 60;
				const CompensationConfig = ConfigManager.PiP.speedCompensation;
				
				if (ParticlePool._cachedCompensation === undefined || ParticlePool._lastFPS !== fps || ParticlePool._cachedCompensationSetConfig !== CompensationConfig) {
					
					let compensation;
					if (!CompensationConfig) compensation = 1;
					else if (fps > 30 ) compensation = 60 / fps;
					else compensation = 1.5;
					
					ParticlePool._cachedCompensation = compensation;
					ParticlePool._lastFPS = fps;
					ParticlePool._cachedCompensationSetConfig = CompensationConfig;
				}
				return ParticlePool._cachedCompensation;
			}
			
			constructor(effectType, count, colorConfig) {
				this.effectType = effectType;
				this.particles = [];
				this.pool = [];
				this.activeParticles = [];

				for (let i = 0; i < count; i++) {
					const particle = this._createParticle(colorConfig);
					this.pool.push(particle);
				}
				this.activateAll();
			}

			_createParticle(colorConfig) {
				switch (this.effectType) {
					case 'star':
						return this._createStarTemplate(colorConfig);
					case 'rain':
						return this._createRainTemplate(colorConfig);
					case 'orb':
						return this._createOrbTemplate(colorConfig);
					case 'meteor':
						return this._createMeteorTemplate(colorConfig);
					default:
						return null;
				}
			}

			_createStarTemplate(colorConfig) {
				const globalOpacity = ConfigManager.PiP.effectGlobalOpacity || 1;
				const config = colorConfig.star;
				const hue = Math.random() * (config.hueRange[1] - config.hueRange[0]) + config.hueRange[0];
				const saturation = Math.random() * (config.saturationRange[1] - config.saturationRange[0]) + config.saturationRange[0];
				const lightness = Math.random() * (config.lightnessRange[1] - config.lightnessRange[0]) + config.lightnessRange[0];
				const sizeMultiplier = config.sizeMultiplier;
				const lineOpacity = config.lineOpacity;
				const speedCompensation = ParticlePool.getSpeedCompensation();
				
				const w = window.innerWidth;
				const h = window.innerHeight;
				
				const x = Math.random() * w;
				const y = Math.random() * h;
				const size = (Math.random() * 0.8 + 0.5) * sizeMultiplier;
				const speed = (Math.random() * 0.35 + 0.2) * speedCompensation;
				const brightness = Math.random() * 0.6 + 0.4;
				const phase = Math.random() * Math.PI * 2;
				const twinkleSpeed = 0.002 + Math.random() * 0.002;
				const twinkleThreshold = 0.2 + Math.random() * 0.35;

				return {
					x: x, y: y,

					reset() {
						this.x = x;
						this.y = y;
						
						return this;
					},

					update() {
						this.y -= speed;
						const twinkle = Date.now() * twinkleSpeed;
						if (this.y < 0) {
							this.y = h;
							this.x = Math.random() * w;
						}
						this.currentBrightness = (brightness + Math.sin(twinkle + phase) * twinkleThreshold) * globalOpacity;
					},

					draw(ctx) {
						ctx.save();
						
						ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${this.currentBrightness})`;
						ctx.beginPath();
						ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
						ctx.fill();
						
						if (lineOpacity > 0) {
							ctx.strokeStyle = `rgba(0, 0, 0, ${lineOpacity})`;
							ctx.lineWidth = 0.14;
							ctx.stroke();
						}
						
						ctx.restore();
					}
				};
			}
			
			static _rainGradientCache = null;
			static _lastRainColors = null;
			
			static getRainGradientTexture(colorA, colorB, length) {
				const colorKey = `${colorA[0]},${colorA[1]},${colorA[2]}_${colorB[0]},${colorB[1]},${colorB[2]}_${length}`;
				
				if (ParticlePool._rainGradientCache && ParticlePool._lastRainColors === colorKey) {
					return ParticlePool._rainGradientCache;
				}
				
				const textureCanvas = document.createElement('canvas');
				textureCanvas.width = 1;
				textureCanvas.height = Math.ceil(length);
				const texCtx = textureCanvas.getContext('2d');
				
				const gradient = texCtx.createLinearGradient(0, 0, 0, length);
				gradient.addColorStop(0, `rgba(${colorA[0]}, ${colorA[1]}, ${colorA[2]}, 1)`);
				gradient.addColorStop(1, `rgba(${colorB[0]}, ${colorB[1]}, ${colorB[2]}, 0)`);
				
				texCtx.fillStyle = gradient;
				texCtx.fillRect(0, 0, 1, length);
				
				ParticlePool._rainGradientCache = textureCanvas;
				ParticlePool._lastRainColors = colorKey;
				
				return textureCanvas;
			}
			
			static getRainTextureForLength(colorA, colorB, length) {
				const roundedLength = Math.round(length / 3) * 3;
				return ParticlePool.getRainGradientTexture(colorA, colorB, roundedLength);
			}
			
			_createRainTemplate(colorConfig) {
				const globalOpacity = ConfigManager.PiP.effectGlobalOpacity || 1;
				const config = colorConfig.rain;
				const color = config.color;
				const opacityRange = config.opacityRange;
				const sizeMultiplier = config.sizeMultiplier || 1;
				const { SIN_ANGLE, COS_ANGLE, DIR_X, DIR_Y } = ParticlePool.getParticleTypeConfig('rain');
				const speedCompensation = ParticlePool.getSpeedCompensation();
				
				const w = window.innerWidth;
				const h = window.innerHeight;
				
				const x = Math.random() * (w + 200) - 150;
				const y = Math.random() * (h + 300) - 150;
				const length = Math.random() * 12 + 18;
				const speed = (Math.random() * 2.5 + 2) * speedCompensation;
				const opacity = (Math.random() * (opacityRange[1] - opacityRange[0]) + opacityRange[0]) * globalOpacity * 1.2;
				const lineWidth = (1.4 + Math.random() * 0.6) * sizeMultiplier;
				const hRand = h + 50 + Math.random() * 150;
				
				const gradientTexture = ParticlePool.getRainTextureForLength(
					color,
					color,
					length
				);
				
				let currentX = x;
				let currentY = y;
				
				const HISTORY_SIZE = 4;
				const xHistory = new Array(HISTORY_SIZE).fill(x);
				const yHistory = new Array(HISTORY_SIZE).fill(y);
				let historyIdx = 0;
				
				function recordPosition() {
					historyIdx = (historyIdx + 1) % HISTORY_SIZE;
					xHistory[historyIdx] = currentX;
					yHistory[historyIdx] = currentY;
				}
				
				return {
					reset() {
						currentX = x;
						currentY = y;
						xHistory.fill(x);
						yHistory.fill(y);
						historyIdx = 0;
						return this;
					},
					
					update() {
						recordPosition();
						
						currentX += speed * SIN_ANGLE;
						currentY += speed * COS_ANGLE;
						
						if (currentY > hRand) {
							currentX = x;
							currentY = -50 - Math.random() * 200;
						}
					},
					
					draw(ctx) {
						if (currentY < -50 || currentY > h + 100 ||
							currentX < -100 || currentX > w + 100) {
							return;
						}
						
						const headX = currentX;
						const headY = currentY;
						
						const dx = DIR_X;
						const dy = DIR_Y;
						
						ctx.save();
						ctx.globalAlpha = opacity;
						
						const angle = Math.atan2(-dx, dy);
						ctx.translate(headX, headY);
						ctx.rotate(angle);
						
						ctx.drawImage(
							gradientTexture,
							0, 0,
							1, gradientTexture.height,
							-lineWidth / 2,
							-length,
							lineWidth,
							length
						);
						
						ctx.restore();
					}
				};
			}

			_createOrbTemplate(colorConfig) {
				const globalOpacity = ConfigManager.PiP.effectGlobalOpacity || 1;
				const config = colorConfig.orb;
				const sizeMultiplier = config.sizeMultiplier || 1;
				const hue = Math.random() * (config.hueRange[1] - config.hueRange[0]) + config.hueRange[0];
				const saturation = Math.random() * (config.saturationRange[1] - config.saturationRange[0]) + config.saturationRange[0];
				const lightness = Math.random() * (config.lightnessRange[1] - config.lightnessRange[0]) + config.lightnessRange[0];
				const speedCompensation = ParticlePool.getSpeedCompensation();
				const orbType = ParticlePool.getParticleTypeConfig('orb');
				const orbTypeRadius = orbType == 0 ? 0.65 : 0.75;
				
				const w = window.innerWidth;
				const h = window.innerHeight;
				
				const radius = 100 + Math.random() * 60 * sizeMultiplier;
				const phaseThreshold = 0.01 + Math.random() * 0.02;
				const outerAlpha = config.outerAlpha;
				
				return {
					x: 0, y: 0,
					vx: 0, vy: 0,
					phase: Math.random() * Math.PI * 2,

					reset() {
						this.x = Math.random() * w;
						this.y = Math.random() * h;
						
						this.vx = (Math.random() - 0.5) * 3;
						this.vy = (Math.random() - 0.5) * 3;
						
						return this;
					},

					update() {
						this.phase += phaseThreshold * speedCompensation;
						if (Math.random() < 0.01) {
							this.vx += (Math.random() - 0.5) * 0.5 * speedCompensation;
							this.vy += (Math.random() - 0.5) * 0.5 * speedCompensation;
							const maxSpeed = 1.7;
							this.vx = Math.min(maxSpeed, Math.max(-maxSpeed, this.vx));
							this.vy = Math.min(maxSpeed, Math.max(-maxSpeed, this.vy));
						}
						this.x += this.vx;
						this.y += this.vy;
						this.currentIntensity = (0.45 + (Math.sin(this.phase) * 0.45)) * globalOpacity;

						if (this.x < 0 || this.x > w) {
							this.vx *= -0.98;
							this.x = Math.max(0, Math.min(w, this.x));
						}
						if (this.y < 0 || this.y > h) {
							this.vy *= -0.98;
							this.y = Math.max(0, Math.min(h, this.y));
						}
					},

					draw(ctx) {
						ctx.save();
						
						// 核心高光
						const coreGradient = ctx.createRadialGradient(
							this.x, this.y, 0,
							this.x, this.y, radius * orbTypeRadius
						);
						
						if (orbType == 0) {
							coreGradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, ${this.currentIntensity * 0.9})`);
							coreGradient.addColorStop(1, 'transparent'); 
						}
						
						if (orbType == 1) {
							coreGradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, ${this.currentIntensity * 0.9})`);
							coreGradient.addColorStop(0.8, 'transparent');
							coreGradient.addColorStop(0.98, `hsla(60, 100%, 98%, ${this.currentIntensity * 0.03})`);
							coreGradient.addColorStop(1, 'transparent');
						}
						
						ctx.fillStyle = coreGradient;
						ctx.beginPath();
						ctx.arc(this.x, this.y, radius * orbTypeRadius, 0, Math.PI * 2);
						ctx.fill();
						
						// 外层光晕
						if (orbType == 0 && this.outerAlpha > 0) {
							const outerGradient = ctx.createRadialGradient(
								this.x, this.y, radius * 0.48,
								this.x, this.y, radius * 1.35
							);
							
							outerGradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, ${this.currentIntensity * this.outerAlpha})`);
							outerGradient.addColorStop(1, 'transparent');
							
							ctx.fillStyle = outerGradient;
							ctx.beginPath();
							ctx.arc(this.x, this.y, radius * 1.35, 0, Math.PI * 2);
							ctx.fill();
						}
						
						ctx.restore();
					}
				};
			}
			
			_createMeteorTemplate(colorConfig) {
				const globalOpacity = ConfigManager.PiP.effectGlobalOpacity || 1;
				const speedCompensation = ParticlePool.getSpeedCompensation();
				const config = colorConfig.meteor;
				const { MeteorType, RANDOM_ANGLE } = ParticlePool.getParticleTypeConfig('meteor');
				const sizeMultiplier = config.sizeMultiplier;
				
				const w = window.innerWidth;
				const h = window.innerHeight;
				
				let length = 70 + Math.random() * 90;
				let brightness = (0.4 + Math.random() * 0.6) * globalOpacity;
				let fade = 0.5 + Math.random() * 0.3;
				let duration, isFast, lineWidth;
				
				const typeRand = Math.random();
				const mediumThreshold = 0.3 + Math.random() * 0.2;
				
				if (typeRand < 0.03) {
					isFast = true;
					duration = 0.65 + Math.random() * 0.35;
					lineWidth = 3.2 * sizeMultiplier;
					length = 200 + Math.random() * 100;
					brightness = (0.6 + Math.random() * 0.4) * globalOpacity;
					fade = 2;
				} else if (typeRand < 0.12) {
					isFast = false;
					duration = 1.3 + Math.random() * 0.7;
					lineWidth = 3 * sizeMultiplier;
				} else if (typeRand < mediumThreshold) {
					isFast = false;
					duration = 2.5 + Math.random() * 1.5;
					lineWidth = (2.5 + Math.random() * 0.5) * sizeMultiplier;
				} else {
					isFast = false;
					duration = 4.5 + Math.random() * 3.5;
					lineWidth = (2 + Math.random() * 0.5) * sizeMultiplier;
				}
				
				const startX = Math.random() * w * 1.5;
				const startY = Math.random() * h * 0.7;
				
				const endX = startX - w * 1.5 * RANDOM_ANGLE;
				const endY = startY + h * 0.9;
				
				const deltaX = endX - startX;
				const deltaY = endY - startY;
				const totalDistance = Math.hypot(deltaX, deltaY);
				const dirX = deltaX / totalDistance;
				const dirY = deltaY / totalDistance;
				const progressDelta = 1 / (duration * 60) * speedCompensation;
				
				return {
					x: startX,
					y: startY,
					progress: 0,
					
					reset() {
						this.startX = Math.random() * w * 1.5;
						this.startY = Math.random() * h * 0.7;
						
						if (!isFast) this.progress = -1 + Math.random() * -1.5;
						else this.progress = -20 + Math.random() * -20;
						
						return this;
					},
					
					update() {
						this.progress += progressDelta;
						
						if (this.progress >= 1) {
							this.reset();
						}
						
						this.x = this.startX + deltaX * this.progress;
						this.y = this.startY + deltaY * this.progress;
					},
					
					draw(ctx) {
						if (this.progress < -0.8) return;
						
						const tailX = this.x - dirX * length;
						const tailY = this.y - dirY * length;
						
						const gradient = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
						const alpha = brightness * (fade - this.progress);
						if (alpha <= 0.02) return;
						
						gradient.addColorStop(0, `rgba(220, 235, 255, ${alpha * 0.98})`);
						gradient.addColorStop(0.4, `rgba(160, 190, 230, ${alpha * 0.6})`);
						gradient.addColorStop(1, `rgba(100, 120, 150, ${alpha * 0.05})`);
						
						ctx.beginPath();
						ctx.moveTo(this.x, this.y);
						ctx.lineTo(tailX, tailY);
						ctx.strokeStyle = gradient;
						ctx.lineWidth = lineWidth;
						ctx.stroke();
						
						ctx.beginPath();
						ctx.arc(this.x, this.y, lineWidth * 0.6, 0, Math.PI * 2);
						ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 1.3})`;
												
						ctx.fill();
						
						if (isFast) {
							if(MeteorType == 0) {
								const angle = Math.atan2(dirY, dirX);
							
								const offset = length * 0.58;
								const centerX = this.x - dirX * offset;
								const centerY = this.y - dirY * offset;
								
								const longRadius = length * 0.7;
								const shortRadius = length * 0.18;
								
								ctx.save();
								
								const auraGradient = ctx.createRadialGradient(
									this.x, this.y, 0,
									this.x, this.y, longRadius
								);
								
								auraGradient.addColorStop(0, 'hsla(0, 0%, 100%, 0.1)');
								auraGradient.addColorStop(0.22, 'hsla(220, 80%, 70%, 0.04)');
								auraGradient.addColorStop(0.7, 'transparent');
								
								ctx.beginPath();
								ctx.ellipse(centerX, centerY, longRadius, shortRadius, angle, 0, Math.PI * 2);
								ctx.fillStyle = auraGradient;
								ctx.fill();
								
								ctx.restore();
								
							} else {
								ctx.save();
							
								const auraGradient = ctx.createRadialGradient(
									this.x, this.y, lineWidth * 0.4,
									this.x, this.y, lineWidth * 8
								);
								auraGradient.addColorStop(0, 'hsla(20, 80%, 100%, 0.5)');
								auraGradient.addColorStop(1, 'transparent');
								
								ctx.beginPath();
								ctx.arc(this.x, this.y, lineWidth * 8, 0, Math.PI * 2);
								ctx.fillStyle = auraGradient;
								ctx.fill();
								
								ctx.restore();
							}
						}
					}
					
				};
			}

			activateAll() {
				this.activeParticles = this.pool.map(p => p.reset());
			}

			getActive() {
				return this.activeParticles;
			}

			resize(newCount, colorConfig) {
				const currentCount = this.pool.length;
				if (newCount > currentCount) {
					for (let i = 0; i < newCount - currentCount; i++) {
						const p = this._createParticle(colorConfig);
						this.pool.push(p);
						this.activeParticles.push(p.reset());
					}
				} else if (newCount < currentCount) {
					this.activeParticles = this.activeParticles.slice(0, newCount);
					this.pool = this.pool.slice(0, newCount);
				}
			}
		}
		
		// ==== 非粒子管理器 ====
		class EffectManager {
			
			static DENSITY_MAP = { 'lowest': 0.6, 'low': 0.65, 'medium': 0.7, 'high': 0.75, 'highest': 0.8 };
			static HIGH_INTENSITY_MAP = { 'lowest': false, 'low': false, 'medium': false, 'high': true, 'highest': true};
			static MEDIUM_INTENSITY_MAP = { 'lowest': false, 'low': false, 'medium': true, 'high': true, 'highest': true};
			
			static POSITION_TOLERANCE = 1;
			
			constructor() {
				this.updateConfig();
			}
			
			updateConfig() {
				const particleCount = ConfigManager.PiP.particleCount;
				
				this.particleCount = particleCount;
				this.baseIntensity = EffectManager.DENSITY_MAP[particleCount] || 0.7;
				this.isHighIntensity = EffectManager.HIGH_INTENSITY_MAP[particleCount];
				this.isMediumIntensity = EffectManager.MEDIUM_INTENSITY_MAP[particleCount];
			}
			
			getIntensity(breathPhase = 0, useBreath = false) {
				let intensity = this.baseIntensity;
				
				if (useBreath && this.isHighIntensity) {
					const breathFactor = Math.sin(breathPhase) * 0.5 + 0.5;
					intensity = this.baseIntensity * breathFactor;
				}
				
				return intensity;
			}
			
			getAlpha(intensity) {
				return intensity;
			}
			
			getHue(baseHue, useGradient = false) {
				if (useGradient && this.isMediumIntensity) {
					return (baseHue + 0.3) % 360;
				}
				return baseHue;
			}
			
			shouldDraw() {
				return state.videoContainer && state.enabled && state.effectEnabled;
			}
			
			// - 拂光 -
			initBorderLight() {
				let glowElement = document.getElementById('bili-pip-glow-element');
				if (!glowElement) {
					glowElement = document.createElement('div');
					glowElement.id = 'bili-pip-glow-element';
					glowElement.style.cssText = `
						position: fixed !important;
						top: 0 !important;
						left: 0 !important;
						pointer-events: none !important;
						z-index: 2147483639 !important;
						opacity: 0 !important;
						transition: opacity 4s ease;
						will-change: transform !important;
						box-shadow: none !important;
					`;
					document.body.appendChild(glowElement);
				}
				
				const colorConfig = ParticlePool.getColorConfig();
				const config = colorConfig.borderlight;
				const hueRange = config.hueRange;
				
				this.borderLightState = {
					glowElement,
					breathPhase: 0,
					baseHue: Math.random() * (hueRange[1] - hueRange[0]) + hueRange[0],
					useBreath: (Math.round(Math.random() * 3) & 1) !== 0,
					useGradient: (Math.round(Math.random() * 3) & 2) !== 0,
					lastBoxShadow: '',
					lastPosition: { top: -1, left: -1, width: -1, height: -1 },
					cachedIntensity: -1,
					cachedHue: -1,
					cachedAlpha: -1
				};
			}
			
			drawBorderLight() {
				if (!this.shouldDraw()) return;
				if (!this.borderLightState) return;

				const bs = this.borderLightState;
				const { glowElement } = bs;
				if (!glowElement) return;
				
				const rect = state.videoContainer.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return;
				
				const lp = bs.lastPosition;
				const positionChanged = Math.abs(lp.top - rect.top) > EffectManager.POSITION_TOLERANCE ||
										Math.abs(lp.left - rect.left) > EffectManager.POSITION_TOLERANCE ||
										Math.abs(lp.width - rect.width) > EffectManager.POSITION_TOLERANCE ||
										Math.abs(lp.height - rect.height) > EffectManager.POSITION_TOLERANCE;
				
				if (positionChanged) {
					glowElement.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
					glowElement.style.width = rect.width + 'px';
					glowElement.style.height = rect.height + 'px';
					Object.assign(lp, { top: rect.top, left: rect.left, width: rect.width, height: rect.height });
				}
				
				if (bs.useBreath && this.isHighIntensity) {
					bs.breathPhase += 0.02;
				}
				
				const intensity = this.getIntensity(bs.breathPhase, bs.useBreath);
				const alpha = this.getAlpha(intensity);
				
				let hue = bs.baseHue;
				if (bs.useGradient && this.isMediumIntensity) {
					bs.baseHue = (bs.baseHue + 0.3) % 360;
					hue = bs.baseHue;
				}
				
				const roundedAlpha = Math.round(alpha * 100) / 100;
				const roundedHue = Math.round(hue);
				
				if (!positionChanged && 
					bs.cachedIntensity === this.baseIntensity &&
					bs.cachedHue === roundedHue &&
					bs.cachedAlpha === roundedAlpha) {
					return;
				}
				
				const a1 = roundedAlpha * 0.4;
				const a2 = roundedAlpha * 0.6;
				const a3 = roundedAlpha * 0.8;
				const boxShadowStyle = `0 0 20px 10px hsla(${roundedHue},90%,90%,${a1}),0 0 15px 7px hsla(${roundedHue},85%,85%,${a2}),0 0 10px 2px hsla(${roundedHue},80%,80%,${a3}),inset 0 0 2px 0px hsla(${roundedHue},90%,90%,${a3})`;
				
				if (bs.lastBoxShadow !== boxShadowStyle) {
					glowElement.style.setProperty('box-shadow', boxShadowStyle, 'important');
					bs.lastBoxShadow = boxShadowStyle;
					bs.cachedIntensity = this.baseIntensity;
					bs.cachedHue = roundedHue;
					bs.cachedAlpha = roundedAlpha;
				}
			}
			
			cleanupBorderLight() {
				const glowElement = document.getElementById('bili-pip-glow-element');
				if (glowElement) glowElement.remove();
				this.borderLightState = null;
			}
			
			// - 描画 -
			initPhantom() {
				const canvas = document.createElement('canvas');
				canvas.style.cssText = `
					position: fixed;
					top: 0;
					left: 0;
					width: 100%;
					height: 100%;
					pointer-events: none;
					z-index: 2147483639;
					opacity: 0;
					transition: opacity 4s ease;
				`;
				canvas.width = window.innerWidth;
				canvas.height = window.innerHeight;
				document.documentElement.appendChild(canvas);
				
				const blurValue = 32 - 20 * this.baseIntensity;
				
				this.phantomState = {
					canvas,
					ctx: canvas.getContext('2d'),
					lastVideoTime: -1,
					cachedFilter: `blur(${blurValue}px) saturate(0.6) brightness(0.8)`,
					cachedAlpha: this.baseIntensity * this.globalOpacity
				};
			}
			
			drawPhantom() {
				if (!this.shouldDraw()) return;
				if (!this.phantomState) return;
				if (!state.videoElement) return;
				
				const video = state.videoElement;
				if (!video.videoWidth || !video.videoHeight) return;
				
				const ps = this.phantomState;
				const { canvas, ctx } = ps;
				
				const currentTime = video.currentTime;
				if (Math.abs(currentTime - ps.lastVideoTime) < 0.025) return;
				ps.lastVideoTime = currentTime;
				
				if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
					canvas.width = window.innerWidth;
					canvas.height = window.innerHeight;
				}
				
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.globalAlpha = ps.cachedAlpha;
				ctx.filter = ps.cachedFilter;
				
				const videoAspect = video.videoWidth / video.videoHeight;
				const canvasAspect = canvas.width / canvas.height;
				
				let drawWidth, drawHeight, drawX, drawY;
				if (videoAspect > canvasAspect) {
					drawHeight = canvas.height;
					drawWidth = drawHeight * videoAspect;
					drawX = (canvas.width - drawWidth) / 2;
					drawY = 0;
				} else {
					drawWidth = canvas.width;
					drawHeight = drawWidth / videoAspect;
					drawX = 0;
					drawY = (canvas.height - drawHeight) / 2;
				}
				
				if (this.isHighIntensity) {
					if (!ps.startTime) {
						ps.startTime = Date.now();
					}
					const elapsed = (Date.now() - ps.startTime) / 900;
					const scale = 1.1 + Math.sin(elapsed) * 0.03;
					
					const scaledWidth = drawWidth * scale;
					const scaledHeight = drawHeight * scale;
					const scaledX = drawX - (scaledWidth - drawWidth) / 2;
					const scaledY = drawY - (scaledHeight - drawHeight) / 2;
					
					drawX = scaledX;
					drawY = scaledY;
					drawWidth = scaledWidth;
					drawHeight = scaledHeight;
				}
				
				try {
					ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
				} catch (e) {
					// 忽略错误
				}
			}
			
			cleanupPhantom() {
				if (this.phantomState?.canvas) {
					this.phantomState.canvas.remove();
				}
				this.phantomState = null;
			}
			
			init(effectType) {
				this.updateConfig();
				
				if (effectType === 'borderlight') {
					this.initBorderLight();
				} else if (effectType === 'phantom') {
					this.initPhantom();
				}
			}
			
			draw(effectType) {
				if (effectType === 'borderlight') {
					this.drawBorderLight();
				} else if (effectType === 'phantom') {
					this.drawPhantom();
				}
			}
			
			cleanup(effectType) {
				if (effectType === 'borderlight') {
					this.cleanupBorderLight();
				} else if (effectType === 'phantom') {
					this.cleanupPhantom();
				}
			}
		}
		
		const EffectRegistry = {
			createParticleEffect(type) {
				return {
					init: (colorConfig, count) => new ParticlePool(type, count, colorConfig),
					draw: (ctx, particles) => particles.forEach(p => p.draw(ctx)),
				};
			},
			
			star: null,
			rain: null,
			orb: null,
			meteor: null,
			
			borderlight: {
				_instance: null,
				init: function() {
					if (!EffectRegistry._effectManager) {
						EffectRegistry._effectManager = new EffectManager();
					}
					EffectRegistry._effectManager.init('borderlight');
				},
				draw: function() {
					if (EffectRegistry._effectManager) {
						EffectRegistry._effectManager.draw('borderlight');
					}
				},
				cleanup: function() {
					if (EffectRegistry._effectManager) {
						EffectRegistry._effectManager.cleanup('borderlight');
					}
				}
			},
			
			phantom: {
				init: function() {
					if (!EffectRegistry._effectManager) {
						EffectRegistry._effectManager = new EffectManager();
					}
					EffectRegistry._effectManager.init('phantom');
				},
				draw: function() {
					if (EffectRegistry._effectManager) {
						EffectRegistry._effectManager.draw('phantom');
					}
				},
				cleanup: function() {
					if (EffectRegistry._effectManager) {
						EffectRegistry._effectManager.cleanup('phantom');
					}
				}
			},
			
			_effectManager: null
		};

		EffectRegistry.star = EffectRegistry.createParticleEffect('star');
		EffectRegistry.rain = EffectRegistry.createParticleEffect('rain');
		EffectRegistry.orb = EffectRegistry.createParticleEffect('orb');
		EffectRegistry.meteor = EffectRegistry.createParticleEffect('meteor');
		
		function initCanvas(effectType) {
			cleanupCanvas();
			
			let actualEffectType = effectType;
			if (effectType === 'random') {
				const effects = ['star', 'rain', 'orb', 'meteor', 'borderlight', 'phantom'];
				const randomIndex = Math.floor(Math.random() * effects.length);
				actualEffectType = effects[randomIndex];
			}
			
			state.currentEffectiveEffect = actualEffectType;
			
			let targetFPS;
			if (actualEffectType === 'borderlight') {
				targetFPS = 24;
			} else if (actualEffectType === 'phantom') {
				targetFPS = Math.max(ConfigManager.PiP.frameRate, 60);
			}else {
				targetFPS = ConfigManager.PiP.frameRate;
			}
			
			state.cachedTargetFPS = targetFPS;
			state.cachedFrameInterval = 1000 / targetFPS;
			state.lastFrameTime = 0;
			
			const frameInterval = state.cachedFrameInterval;
			let lastTime = 0;
			
			const effect = EffectRegistry[actualEffectType];
			if (!effect) return;
			
			if (actualEffectType === 'borderlight' || actualEffectType === 'phantom') {
				effect.init();
				
				const animate = (timestamp) => {
					state.animationFrame = requestAnimationFrame(animate);
					
					if (lastTime === 0 || timestamp - lastTime >= frameInterval) {
						lastTime = timestamp;
						effect.draw();
					}
				};
				
				state.animationFrame = requestAnimationFrame(animate);
				return;
			}else {
				const canvas = document.createElement('canvas');
				canvas.style.cssText = `
					position: fixed;
					top: 0;
					left: 0;
					width: 100vw;
					height: 100vh;
					pointer-events: none;
					z-index: ${ConfigManager.PiP.effectLayer ? '2147483643' : '2147483639'};
					opacity: 0;
					transition: opacity 4s ease;
				`;
				canvas.width = window.innerWidth;
				canvas.height = window.innerHeight;
				document.body.appendChild(canvas);
				state.canvasLayer = canvas;
				state.ctx = canvas.getContext('2d');
				
				const colorConfig = ParticlePool.getColorConfig();
				const count = ParticlePool.getParticleCount(actualEffectType);
				state.particlePool = effect.init(colorConfig, count);
				
				void canvas.offsetHeight;
				
				if (state.isVideoPlaying) {
					setTimeout(() => {
						if (state.canvasLayer && state.effectEnabled) {
							state.canvasLayer.style.opacity = '1';
						}
					}, 150);
				}
				
				const animate = (timestamp) => {
					if (lastTime === 0 || timestamp - lastTime >= frameInterval) {
						lastTime = timestamp;
						
						const ctx = state.ctx;
						const canvas = state.canvasLayer;
						
						ctx.clearRect(0, 0, canvas.width, canvas.height);
						
						const particles = state.particlePool.getActive();
						particles.forEach(p => p.update());
						effect.draw(ctx, particles);
					}
					
					state.animationFrame = requestAnimationFrame(animate);
				};
			
				state.animationFrame = requestAnimationFrame(animate);
			}
			bindResizeHandler(actualEffectType);
		}

		function bindResizeHandler(effectType) {
			let resizeTimer;
			let lastWindowArea = window.innerWidth * window.innerHeight;
			const MIN_AREA_CHANGE = 0.1;
			const DEBOUNCE_DELAY = 300;

			const handler = () => {
				clearTimeout(resizeTimer);
				resizeTimer = setTimeout(() => {
					if (!state.canvasLayer || !state.particlePool) return;

					state.canvasLayer.width = window.innerWidth;
					state.canvasLayer.height = window.innerHeight;

					const currentArea = window.innerWidth * window.innerHeight;
					const areaChange = Math.abs(currentArea - lastWindowArea) / lastWindowArea;

					if (areaChange > MIN_AREA_CHANGE) {
						const newCount = ParticlePool.getParticleCount(effectType);
						const colorConfig = ParticlePool.getColorConfig();
						state.particlePool.resize(newCount, colorConfig);
						lastWindowArea = currentArea;
					}
				}, DEBOUNCE_DELAY);
			};

			window.removeEventListener('resize', state._resizeHandler);
			state._resizeHandler = handler;
			window.addEventListener('resize', handler);
		}
	
		const EffectPlaybackManager = {
			initVideoListeners() {
				if (state.videoElementObserved) return;
				
				const video = state.videoElement;
				if (!video) return;
				
				state.videoPlayHandler = () => {
					state.isVideoPlaying = true;
					this.updateEffectState();
				};
				
				state.videoPauseHandler = () => {
					state.isVideoPlaying = false;
					this.updateEffectState();
				};
				
				video.addEventListener('play', state.videoPlayHandler);
				video.addEventListener('pause', state.videoPauseHandler);
				
				state.isVideoPlaying = !video.paused;
				state.videoElementObserved = true;
				
				this.updateEffectState();
			},
			
			cleanupVideoListeners() {
				if (state.videoElement && state.videoElementObserved) {
					if (state.videoPlayHandler) {
						state.videoElement.removeEventListener('play', state.videoPlayHandler);
					}
					if (state.videoPauseHandler) {
						state.videoElement.removeEventListener('pause', state.videoPauseHandler);
					}
				}
				state.videoElementObserved = false;
				state.videoPlayHandler = null;
				state.videoPauseHandler = null;
			},
			
			updateEffectState() {
				let shouldEnable = state.isVideoPlaying && state.enabled;
				const currentEffect = state.currentEffectiveEffect;
				
				if (currentEffect === 'phantom' && state.isShrunk) shouldEnable = false;
				if (shouldEnable === state.effectEnabled) return;
				
				state.effectEnabled = shouldEnable;
				
				if (shouldEnable) {
					this.resumeEffect(currentEffect);
				} else {
					this.pauseEffect(currentEffect);
				}
			},
			
			pauseEffect(currentEffect) {
				if (state.canvasLayer) {
					state.canvasLayer.style.transition = 'opacity 4s ease';
					state.canvasLayer.style.opacity = '0';
				}
				
				if (currentEffect === 'phantom') {
					const effectManager = EffectRegistry._effectManager;
					if (effectManager && effectManager.phantomState) {
						const canvas = effectManager.phantomState.canvas;
						if (canvas) {
							canvas.style.opacity = getComputedStyle(canvas).opacity;
							canvas.style.transition = 'opacity 3s ease';
							canvas.style.opacity = '0';
							
						}
					}
					
					if (!state.isShrunk) updateBlurMode();
				}
				
				const glowElement = document.getElementById('bili-pip-glow-element');
				if (glowElement) {
					glowElement.style.opacity = getComputedStyle(glowElement).opacity;
					glowElement.style.transition = 'opacity 4s ease';
					glowElement.style.opacity = '0';
				}
				
				if (currentEffect === 'borderlight' && state.videoContainer) {
					state.videoContainer.style.transition = 'box-shadow 3s ease';
					const boxShadow = getBoxShadow();
					state.videoContainer.style.boxShadow = boxShadow;
					state.videoContainer.style.setProperty('box-shadow', boxShadow, 'important');
				}
			},
			
			resumeEffect(currentEffect) {
				if (state.canvasLayer) {
					state.canvasLayer.style.transition = 'opacity 4s ease';
					state.canvasLayer.style.opacity = '1';
				}
				
				if (currentEffect === 'phantom') {
					const effectManager = EffectRegistry._effectManager;
					if (effectManager && effectManager.phantomState) {
						const canvas = effectManager.phantomState.canvas;
						if (canvas) {
							canvas.style.opacity = getComputedStyle(canvas).opacity;
							canvas.style.transition = 'opacity 5s ease';
							canvas.style.opacity = '1';
						}
					}
					
					if (state.coverBlurLayer) {
						state.coverBlurLayer.style.filter = 'none';
					} else {
						const backgroundContent = document.querySelector(SELECTORS.backgroundContent);
						if (backgroundContent) backgroundContent.style.filter = 'none';
					}
					
					state.overlay.style.backgroundColor = getOverlayColor(1);
				}
				
				const glowElement = document.getElementById('bili-pip-glow-element');
				if (glowElement) {
					glowElement.style.opacity = getComputedStyle(glowElement).opacity;
					glowElement.style.transition = 'opacity 4s ease';
					glowElement.style.opacity = '1';
					glowElement.style.display = 'block';
					
					state.videoContainer.style.transition = 'box-shadow 3s ease';
					state.videoContainer.style.boxShadow = 'none';
				}
			},
			
			checkInitialPlayback() {
				if (!state.videoElement) return false;
				state.isVideoPlaying = !state.videoElement.paused;
				return state.isVideoPlaying;
			}
		};
		
		function cleanupCanvas() {
			if (state.animationFrame) {
				cancelAnimationFrame(state.animationFrame);
				state.animationFrame = null;
			}
			
			if (state.canvasLayer) {
				state.canvasLayer.remove();
				state.canvasLayer = null;
				state.ctx = null;
			}
			
			state.particlePool = null;
			
			const currentEffect = state.currentEffectiveEffect;
			if (currentEffect === 'borderlight' || currentEffect === 'phantom') {
				const effect = EffectRegistry[currentEffect];
				if (effect && effect.cleanup) {
					effect.cleanup();
				}
			}
			
			if (state._resizeHandler) {
				window.removeEventListener('resize', state._resizeHandler);
				state._resizeHandler = null;
			}
			
			state.glowData = null;
			state.phantomData = null;
			
			state.lastFrameTime = 0;
			state.currentEffectiveEffect = null;
			state.effectEnabled = false;
		}

        // -- 初始化与清理 --
        function init() {
            injectStyles();
			
            // 启动按钮注入
            let retry = 0;
            function tryInject() {
                if (injectButton()) {
					if (ConfigManager.Auto.loadAction === 'pip' && !state.enabled) {
						// 等待视频元数据加载
						const video = document.querySelector(SELECTORS.videoElement);
						if (video) {
							if (video.videoWidth && video.videoHeight) {
								const delay = ConfigManager.Other.performanceMode ? 1200 : 600;
								setTimeout(() => toggle(true), delay);
							} else {
								const delay = ConfigManager.Other.performanceMode ? 1000 : 500;
								video.addEventListener('loadedmetadata', () => {
									setTimeout(() => toggle(true), delay);
								}, { once: true });
							}
						}
					}
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
			
			if (state.globalMouseUpHandler) {
				document.removeEventListener('mouseup', state.globalMouseUpHandler);
				state.globalMouseUpHandler = null;
			}
		}

        return {
            init,
            toggle,
			enable,
			disable,
            cleanup,
            setClickShrink: (enabled) => {
                ConfigManager.PiP.clickOutsideToShrink = enabled;
                GM_setValue('pip_click_outside_shrink', enabled);
            },
            get clickShrinkEnabled() { return ConfigManager.PiP.clickOutsideToShrink; },
            get enabled() { return state.enabled; },
        };
		
    })();
	
	
    // ==== 页面定位系统 ====
    const PagePositionSystem = (function() {
        const state = {
            offset: ConfigManager.Horizontal.offset,
            verticalOffset: ConfigManager.Horizontal.verticalOffset,
			videoTopOffset: ConfigManager.Horizontal.videoTopOffset || false,	
			targetY: 0,
        };

        function centerPage() {
			if (isExcludedPage()) return;
			
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
			if (state.videoTopOffset) {
				const videoContainer = document.querySelector(SELECTORS.videoContainer);
				if (videoContainer) {
					const videoRect = videoContainer.getBoundingClientRect();
					const videoTopAbsolute = window.scrollY + videoRect.top;
					state.targetY = Math.max(0, videoTopAbsolute - state.verticalOffset);
				}
			}else { state.targetY = state.verticalOffset; }
			
			window.scrollTo({ 
				top: state.targetY, 
				left: window.scrollX, 
				behavior: 'smooth' 
			});
			return true;
		}
		
		function triggerVerticalScroll() {
			if (ConfigManager.Horizontal.verticalOffset > 0) {
				verticalScroll();

				let checkCount = 0;
				const maxChecks = 50;
				const targetY = Math.max(state.videoTopOffset ? state.targetY : ConfigManager.Horizontal.verticalOffset, 10);

				const checkScroll = setInterval(() => {
					checkCount++;
					const currentY = window.scrollY;

					if (Math.abs(currentY - targetY) < 10) {
						clearInterval(checkScroll);
						return;
					}

					if (checkCount >= maxChecks) {
						clearInterval(checkScroll);
					}
				}, 100);
			}
		}
		
		function triggerLoadPosition() {
			if (ConfigManager.Horizontal.loadHorizontalEnabled) {
				centerPage();
			}
			if (ConfigManager.Horizontal.loadVerticalEnabled) {
				triggerVerticalScroll();
			}
		}
		
		function triggerWidePosition() {
			if (ConfigManager.Horizontal.wideHorizontalEnabled) {
				centerPage();
			}
			if (ConfigManager.Horizontal.wideVerticalEnabled) {
				verticalScroll();
			}
		}
		
		function triggerFullscreenExitPosition() {
			if(PictureInPictureSystem.enabled) return;
			if (ConfigManager.Horizontal.fullscreenHorizontalEnabled) {
				centerPage();
			}
			if (ConfigManager.Horizontal.fullscreenVerticalEnabled) {
				verticalScroll();
			}
		}

        function setupScreenModeListener() {
            document.removeEventListener('click', handleScreenModeClick);
            document.addEventListener('click', handleScreenModeClick);
        }

        function handleScreenModeClick(e) {
            const isWide = e.target.closest(SELECTORS.wideButton);
			const isWebFull = e.target.closest(SELECTORS.webFullscreenButton);
			const authorsign = "lo_gewebFullscreenButtonlike";
			
			if (isWide) setTimeout(() => { triggerWidePosition(); }, 150);
			
			// 属于“退出全屏后定位”项目，网页全屏目前只能监听按钮事件
			if (isWebFull) setTimeout(() => { triggerFullscreenExitPosition(); }, 150);
        }
		
		function triggerAutoWide() {
			let attempts = 0;
			const maxAttempts = 20;
			const selectors = [
				'.bpx-player-ctrl-wide',
				'.bilibili-player-video-btn-wide',
				'[title="宽屏"]',
				'[aria-label="宽屏"]',
				'.bpx-player-ctrl-btn[title="宽屏"]'
			];
			
			const interval = setInterval(() => {
				attempts++;
				
				let btn = null;
				for (const sel of selectors) {
					btn = document.querySelector(sel);
					if (btn) break;
				}
				
				if (btn) {
					clearInterval(interval);
					btn.click();
				} else if (attempts >= maxAttempts) {
					clearInterval(interval);
				}
			}, 100);
		}

        function setOffset(offset) {
            state.offset = offset;
            ConfigManager.Horizontal.offset = offset;
            GM_setValue('h_offset', offset);
        }

        function setVerticalOffset(offset) {
            state.verticalOffset = offset;
            ConfigManager.Horizontal.verticalOffset = offset;
            GM_setValue('h_vertical_offset', offset);
        }
		
		function init() {
			if (ConfigManager.Horizontal.loadHorizontalEnabled || ConfigManager.Horizontal.loadVerticalEnabled) {
				const delay = ConfigManager.Other.performanceMode ? 800 : 400;
				setTimeout(() => triggerLoadPosition(), delay);
			}
			
			if (ConfigManager.Horizontal.wideHorizontalEnabled || ConfigManager.Horizontal.wideVerticalEnabled) {
				const delay = ConfigManager.Other.performanceMode ? 800 : 400;
				setTimeout(() => { setupScreenModeListener(); }, delay);
			}
			
			if (ConfigManager.Horizontal.fullscreenHorizontalEnabled || ConfigManager.Horizontal.fullscreenVerticalEnabled) {
				document.addEventListener('fullscreenchange', () => {
					if (!document.fullscreenElement) {
						setTimeout(() => triggerFullscreenExitPosition(), 150);
					}
				});
			}
		}

        return {
            init,
            centerPage,
            triggerVerticalScroll,
			triggerLoadPosition,
            setOffset,
            setVerticalOffset,
			triggerAutoWide,
			getTargetY: () => state.targetY,
            getConfig: () => ({ ...state }),
        };
    })();
	
	
	// ==== 自动全屏管理系统 ====
	const AutoFullscreenManager = (function() {
		
		let fullscreenHandler = null;
		let webkitFullscreenHandler = null;
		let mozFullscreenHandler = null;
		let msFullscreenHandler = null;
		
		// # 检查是否处于全屏状态
		function isFullscreen() {
			return !!(document.fullscreenElement || 
					  document.webkitFullscreenElement || 
					  document.mozFullScreenElement || 
					  document.msFullscreenElement);
		}
		
		// # 请求全屏
		function requestFullscreen(element = document.documentElement) {
			if (isFullscreen()) {
				return;
			}
			
			const requestMethod = element.requestFullscreen || 
								  element.webkitRequestFullscreen || 
								  element.mozRequestFullScreen || 
								  element.msRequestFullscreen;
			
			if (requestMethod) {
				requestMethod.call(element).catch(err => {
				});
			}
		}
		
		// # 退出全屏
		function exitFullscreen() {
			if (!isFullscreen()) {
				return;
			}
			
			
			const exitMethod = document.exitFullscreen || 
							   document.webkitExitFullscreen || 
							   document.mozCancelFullScreen || 
							   document.msExitFullscreen;
			
			if (exitMethod) {
				exitMethod.call(document).catch(err => {
				});
			}
		}
		
		// # 监听全屏变化，重置标记
		function setupFullscreenListener() {
			
			// 不同浏览器需要不同的事件名，但可以用同一个处理函数
			webkitFullscreenHandler = fullscreenHandler;
			mozFullscreenHandler = fullscreenHandler;
			msFullscreenHandler = fullscreenHandler;
			
			document.addEventListener('fullscreenchange', fullscreenHandler);
			document.addEventListener('webkitfullscreenchange', webkitFullscreenHandler);
			document.addEventListener('mozfullscreenchange', mozFullscreenHandler);
			document.addEventListener('MSFullscreenChange', msFullscreenHandler);
		}
		
		// # 处理播放事件
		function handlePlayEvent(e) {
			if (e.target.tagName !== 'VIDEO') return;
			if (ConfigManager.Auto.playEnterFullscreen && !isFullscreen()) {
				requestFullscreen(document.documentElement);
			}
		}
		
		// # 处理暂停事件
		function handlePauseEvent(e) {
			if (e.target.tagName !== 'VIDEO') return;
			
			if (ConfigManager.Auto.pauseExitFullscreen && isFullscreen()) {
				exitFullscreen();
			}
		}
		
		// # 设置视频事件监听（使用捕获阶段）
		function setupVideoListeners() {
			document.addEventListener('play', handlePlayEvent, true);
			document.addEventListener('pause', handlePauseEvent, true);
		}
		
		function init() {
			if (ConfigManager.Auto.pipEnterFullscreen || ConfigManager.Auto.pipExitFullscreen) setupFullscreenListener();
			if (ConfigManager.Auto.playEnterFullscreen || ConfigManager.Auto.pauseExitFullscreen) setupVideoListeners();
		}
		
		function cleanup() { 
			document.removeEventListener('play', handlePlayEvent, true);
			document.removeEventListener('pause', handlePauseEvent, true);
			
			if (fullscreenHandler) {
				document.removeEventListener('fullscreenchange', fullscreenHandler);
				fullscreenHandler = null;
			}
			if (webkitFullscreenHandler) {
				document.removeEventListener('webkitfullscreenchange', webkitFullscreenHandler);
				webkitFullscreenHandler = null;
			}
			if (mozFullscreenHandler) {
				document.removeEventListener('mozfullscreenchange', mozFullscreenHandler);
				mozFullscreenHandler = null;
			}
			if (msFullscreenHandler) {
				document.removeEventListener('MSFullscreenChange', msFullscreenHandler);
				msFullscreenHandler = null;
			}
		}
		
		return {
			init,
			cleanup,
			requestFullscreen,
			exitFullscreen,
			isFullscreen
		};
	})();


    // ==== 其他功能 ====
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

    function setupAutoWebFullscreen() {	
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
                setTimeout(() => btn.click(), 800);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
            }
        }, 100);
	}
	
	function updateScrollbarVisibility() {
		const mode = ConfigManager.Other.scrollbarHideMode;
		const isPipEnabled = PictureInPictureSystem.enabled;
		
		// 清除已有的滚动条隐藏样式
		const existingStyle = document.getElementById('bili-pip-scrollbar-style');
		if (existingStyle) {
			existingStyle.remove();
		}
		
		// 根据模式决定是否隐藏滚动条
		let shouldHide = false;
		if (mode === 'always') {
			shouldHide = true;
		}else if (mode === 'pip-only' && isPipEnabled) {
			shouldHide = true;
		}
		
		if (shouldHide) {
			// 隐藏滚动条但保留滚动功能
			document.documentElement.style.overflow = ' '; // auto
			document.documentElement.style.scrollbarWidth = 'none'; // Firefox
			document.documentElement.style.msOverflowStyle = 'none';
			
			// 添加样式隐藏 WebKit 滚动条
			const style = document.createElement('style');
			style.id = 'bili-pip-scrollbar-style';
			style.textContent = `
				html {
					scrollbar-width: none !important;  /* Firefox */
					-ms-overflow-style: none !important;
				}
				html::-webkit-scrollbar {
					display: none !important;
					width: 0 !important;
					height: 0 !important;
					background: transparent !important;
				}
			`;
			document.head.appendChild(style);
		} else {
			// 恢复滚动条
			document.documentElement.style.overflow = '';
			document.documentElement.style.scrollbarWidth = '';
			document.documentElement.style.msOverflowStyle = '';
		}
	}

    function setupMenu() {
        GM_registerMenuCommand('⚙ 设置', togglePanel);
    }
	
    // ==================== 主初始化 ====================
    function init() {
        setupMenu();
        PictureInPictureSystem.init();
        PagePositionSystem.init();
		AutoFullscreenManager.init();
        setupPreventSpaceScroll();
		initVisualPanel();
		updateScrollbarVisibility();
		
		const loadAction = ConfigManager.Auto.loadAction;
		const delay = ConfigManager.Other.performanceMode ? 1000 : 500;
		if (loadAction === 'pip') { /* 画中画已在 PictureInPictureSystem.init 中处理 */ }
		else if (loadAction === 'wide') { setTimeout(() => { PagePositionSystem.triggerAutoWide(); }, delay); }
		else if (loadAction === 'fullscreen') { setTimeout(() => { setupAutoWebFullscreen(); }, delay); }
		
		// # 切集
		window.addEventListener('popstate', handleUrlChange);
		const originalPushState = history.pushState;
		const originalReplaceState = history.replaceState;
		
		history.pushState = function() {
			originalPushState.apply(this, arguments);
			handleUrlChange();
		};
		
		history.replaceState = function() {
			originalReplaceState.apply(this, arguments);
			handleUrlChange();
		};
		
		let urlChangeTimer = null;
		
		function handleUrlChange() {
			if (!PictureInPictureSystem.enabled) setTimeout(() => {
				PagePositionSystem.triggerLoadPosition();
				return;
			}, 100);
			
			if (PictureInPictureSystem.enabled) {
				if (urlChangeTimer) clearTimeout(urlChangeTimer);
				
				globalState.isUrlChange = true;
				PictureInPictureSystem.disable();
				
				urlChangeTimer = setTimeout(() => {
					PictureInPictureSystem.enable();
					globalState.isUrlChange = false;
					urlChangeTimer = null;
				}, 600);
			}
		}
    }
	
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('beforeunload', () => {
        PictureInPictureSystem.cleanup();
		AutoFullscreenManager.cleanup();
        document.body.onkeydown = null;
    });
	
})();
