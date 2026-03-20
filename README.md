# mkraftman-roku-keyboard

Custom HACS Lovelace card for Roku text input. Opens the native soft keyboard and sends keystrokes to the Roku via `remote.send_command` using `literal_X` for characters and `backspace` for deletions.

## Installation

Install via HACS as a custom repository.

## Configuration

```yaml
type: custom:mkraftman-roku-keyboard
entity: remote.roku_ultra_living_room
```

| Option | Required | Description |
|--------|----------|-------------|
| entity | Yes | The `remote.*` entity for your Roku device |
