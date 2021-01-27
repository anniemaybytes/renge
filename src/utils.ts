import colors from 'irc-colors';

const colorMap: { [color: string]: (str: string) => string } = {
  white: colors.white,
  navy: colors.navy,
  green: colors.green,
  red: colors.red,
  brown: colors.brown,
  purple: colors.purple,
  olive: colors.olive,
  yellow: colors.yellow,
  lime: colors.lime,
  teal: colors.teal,
  cyan: colors.cyan,
  blue: colors.blue,
  pink: colors.pink,
  gray: colors.gray,
};

export function randomIRCColor() {
  const allColors = Object.keys(colorMap);
  return allColors[Math.floor(Math.random() * allColors.length)];
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
