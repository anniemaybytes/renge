import colors from 'irc-colors';

const colorMap: { [color: string]: (str: string) => string } = {
  green: colors.green,
  navy: colors.navy,
  red: colors.red,
  white: colors.white,
  brown: colors.brown,
  purple: colors.purple,
  yellow: colors.yellow,
  olive: colors.olive,
  lime: colors.lime,
  teal: colors.teal,
  pink: colors.pink,
  cyan: colors.cyan,
  gray: colors.gray,
  blue: colors.blue,
};

const colorsList = Object.keys(colorMap);
let currentColorIndex = Math.floor(Math.random() * colorsList.length);

export function randomIRCColor() {
  return colorsList[currentColorIndex++ % colorsList.length];
}

export function getIRCColorFunc(color: string) {
  return colorMap[color] || colors.black; // Defaults to black if provided color arg was invalid
}

export function spaceNick(ircString: string) {
  return ircString.split('').join('\u200B');
}

export async function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ircRegexReplace(pattern: string) {
  const regexSpecialChars = ['\\', '.', '+', '|', '[', ']', '{', '}', '^', '$'];
  regexSpecialChars.forEach((char) => {
    pattern = pattern.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
  });
  pattern = pattern.replace(/\?/g, '.');
  pattern = pattern.replace(/\*/g, '.*');
  return new RegExp(`^${pattern}$`);
}

export function matchIRCHostMask(pattern: string, nick: string, ident: string, hostname: string) {
  const nickPatternIndex = pattern.indexOf('!');
  if (nickPatternIndex !== -1) {
    const nickPattern = pattern.substring(0, nickPatternIndex);
    if (!ircRegexReplace(nickPattern).exec(nick)) return false;
    pattern = pattern.substring(nickPatternIndex + 1);
  }
  const identPatternIndex = pattern.indexOf('@');
  if (identPatternIndex !== -1) {
    const identPattern = pattern.substring(0, identPatternIndex);
    if (!ircRegexReplace(identPattern).exec(ident)) return false;
    pattern = pattern.substring(identPatternIndex + 1);
  }
  return Boolean(ircRegexReplace(pattern).exec(hostname));
}

export function minutesToString(minutes: number) {
  const baseMinutes = Math.floor(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours) {
    if (hours === 1) return 'one hour';
    else return `${hours} hours`;
  } else {
    if (baseMinutes === 1) return 'a minute';
    else return `${baseMinutes} minutes`;
  }
}

export function dateToFriendlyString(date: Date) {
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z/, ' UTC');
}
