// 亮/暗主题读写。localStorage 在无痕模式、受限 origin、以及未启用
// --localstorage-file 的 Node/测试环境下可能抛错，全部 try/catch 兜底亮色（森米工作台默认奶油底）。

export type Theme = 'dark' | 'light';

const KEY = 'theme';

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function writeTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* 写入失败不影响本次会话内切换，静默忽略。 */
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}
