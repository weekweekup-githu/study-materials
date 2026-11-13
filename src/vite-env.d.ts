/// <reference types="vite/client" />

/** 由 vite.config.ts 的 define 注入，来源是 package.json 的 version */
declare const __APP_VERSION__: string;

/** 构建时由 VITE_DIAG=1 打开，用于在设备上显示诊断浮层（默认关闭） */
declare const __DIAG__: boolean;