# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## v3.2.0
### Changed
- Remove Alpine >= 3.13 restriction

## v3.1.0
### Changed
- Use specific User-Agent

## v3.0.0
### Changed
- Bumped minimum supported Node version to v16.13.0
- Bumped TypeScript target to ES2021

## v2.5.0
### Added
- Set up channel modes for session channels at the start of each session

## v2.4.2
### Fixed
- Don't end a session when checking if in progress if the session hasn't even started

## v2.4.1
### Changed
- Force usage of Alpine 3.13 in Dockerfile

## v2.4.0
### Changed
- Customize error messages

## v2.3.0
### Changed
- Don't split commands on U+200B if pasting a spaced nick
- Don't ever space a normal user's nick in any scenario (only staff nicks)

## v2.2.0
### Fixed
- Only allow a session to be ended once ever

### Changed
- Update idle warning message string
- Pick session colors in pre-determined random order
- Format replies better when replying to events with unqueue errors
- Update `!sessions` output to include color, time, and reason

## v2.1.0
### Fixed
- `!reenable` not working in active session

### Added
- When reenabling, provide user with message indicating they must login by midnight UTC
- `!sessions` commands for staff to see list of active sessions
- `!kill` command for staff to forcefully end any active session via channel-name
- `!ip` command for staff to see IP of any queued or currently handled user
- `!logs` command for staff to view previous 10 sessions and their paste link

### Changed
- Don't allow staff or channel operators to enter queue
- Don't allow staff to reenable user in support channel

## v2.0.0
### Added
- LevelDB based state persistence

### Changed
- Initial TypeScript implementation
- Reflect changes from tentacles to `reenable` API endpoint

### Removed
- Ability to manipulate queue by username

## v1.5.0
### Changed
- Refresh lockfile
- Removed usage of deprecated `Supervisor.Spec`
- Allow running with Elixir 1.11

## v1.4.0
### Changed
- Updated dependencies
- Removed manual application control
- Allow running with Elixir 1.10

## v1.3.2
### Fixed
- Zero unix time for support session log filename

### Changed
- Pin dependencies (no difference at the time of publishing this release)

## v1.3.1
### Changed
- Added CHANGELOG
