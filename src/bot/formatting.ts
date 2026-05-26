import { Markup } from 'telegraf';

const MD_V2_ESCAPE = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

export function escapeMdV2(text: string): string {
  return text.replace(MD_V2_ESCAPE, '\\$1');
}

export function spoiler(text: string): string {
  return `||${escapeMdV2(text)}||`;
}

export function formatKoWithSpoilerEn(textKo: string, textEn: string): string {
  return `${escapeMdV2(textKo)}\n\n${spoiler(textEn)}`;
}

export function hintKeyboard(turnId: string) {
  return Markup.inlineKeyboard([
    Markup.button.callback('💡 1', `hint:1:${turnId}`),
    Markup.button.callback('💡 2', `hint:2:${turnId}`),
    Markup.button.callback('💡 3', `hint:3:${turnId}`),
  ]);
}
