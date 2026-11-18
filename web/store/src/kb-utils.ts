import type { Me } from './types';

export const KB_ALLOWED_EXT = ['.md', '.txt', '.markdown', '.pdf', '.docx'];
export const KB_MAX_BYTES = 20 * 1024 * 1024;

export function canKbManage(me: Me | null): boolean {
  if (!me) return false;
  return me.role === 'admin' || (me.permissions ?? []).includes('kb.manage');
}

export function canSkillReview(me: Me | null): boolean {
  if (!me) return false;
  return me.role === 'developer' || me.role === 'admin' || (me.permissions ?? []).includes('skill.review');
}

export function canSkillManage(me: Me | null): boolean {
  if (!me) return false;
  return me.role === 'admin' || (me.permissions ?? []).includes('skill.manage');
}

export function isFullAdmin(me: Me | null): boolean {
  return me?.role === 'admin';
}

export function validateKbFile(file: File): string | null {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!KB_ALLOWED_EXT.includes(ext)) {
    return `不支持的格式「${ext || '(无扩展名)'}」，允许：${KB_ALLOWED_EXT.join(', ')}`;
  }
  if (file.size > KB_MAX_BYTES) {
    return `文件超过 ${Math.round(KB_MAX_BYTES / 1024 / 1024)}MB 上限`;
  }
  if (file.size === 0) return '文件为空';
  return null;
}
