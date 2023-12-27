export interface QueuedUser {
  nick: string;
  reason: string;
  time: Date;
  ip: string;
}

export interface ReEnableResponse {
  success: boolean;
  queue?: boolean;
  error?: string;
}

export interface ConfigFile {
  state_db?: string;
  irc_server?: string;
  irc_port?: number;
  irc_use_ssl?: boolean;
  irc_verify_ssl?: boolean;
  irc_nick?: string;
  irc_realname?: string;
  irc_username?: string;
  oper_username?: string;
  oper_pass?: string;
  site_api_key?: string;
  staff_channel?: string;
  user_channel?: string;
  log_channel?: string;
  session_channels?: string[];
  staff_hostmasks?: string[];
  logs_dir?: string;
}

export interface MessageEvent {
  nick: string;
  ident: string;
  hostname: string;
  target: string;
  message: string;
  reply: (message: string) => void;
}

export interface WHOISResponse {
  nick: string;
  ident: string;
  hostname: string;
  real_name: string;
  server: string;
  server_info: string;
  channels: string;
  actual_ip?: string;
  actual_hostname?: string;
}

export interface WHOResponse {
  nick: string;
  ident: string;
  hostname: string;
  server: string;
  real_name: string;
  away: boolean;
  num_hops_away: number;
  channel: string;
  channel_modes: string[];
}

export interface PreviousLog {
  user: string;
  staff: string;
  time: Date;
  paste: string;
}

export interface ChannelState {
  [channel: string]: Set<string>;
}

export interface DetailedIpInfo {
  status: "success" | "fail",
  countryCode: string,
  proxy: boolean,
  hosting: boolean,
  message: string,
}

export type JoinHandler = Set<(nick: string, channel: string) => any>;
export type LeaveHandler = Set<(nick: string, channel: string, leaveType: 'kicked' | 'parted' | 'quit') => any>;
export type DisconnectHandler = Set<() => any>;
export type ConnectedHandler = Set<() => any>;
export type RenameHandler = Set<(oldNick: string, newNick: string) => any>;
