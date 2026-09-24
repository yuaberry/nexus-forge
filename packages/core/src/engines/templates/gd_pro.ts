/**
 * Professional game kit — shared assets that raise generated games from
 * "prototype" to "product": real audio (synthesized WAV, no external assets),
 * main menu with pause/settings, persistent saves and polish hooks.
 *
 * gdscript: scripts injected into every generated Godot project.
 * wav():     PCM16 mono WAV files synthesized in pure TS (deterministic).
 */
import type { GameSpec } from "../types";

// --- WAV synthesis (44.1k? 22050 Hz keeps files tiny — fine for SFX) ---------

function wav(samples: Int16Array, sampleRate = 22050): Uint8Array {
  const data = new Uint8Array(44 + samples.length * 2);
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) data[off + i] = s.charCodeAt(i); };
  w(0, "RIFF");
  new DataView(data.buffer).setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE"); w(12, "fmt ");
  new DataView(data.buffer).setUint32(16, 16, true);
  new DataView(data.buffer).setUint16(20, 1, true);   // PCM
  new DataView(data.buffer).setUint16(22, 1, true);   // mono
  new DataView(data.buffer).setUint32(24, sampleRate, true);
  new DataView(data.buffer).setUint32(28, sampleRate * 2, true);
  new DataView(data.buffer).setUint16(32, 2, true);
  new DataView(data.buffer).setUint16(34, 16, true);
  w(36, "data");
  new DataView(data.buffer).setUint32(40, samples.length * 2, true);
  const dv = new DataView(data.buffer);
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * 2, samples[i] ?? 0, true);
  return data;
}

const SR = 22050;

/** Short UI click (tick). */
export function sfxClick(): Uint8Array {
  const n = Math.floor(SR * 0.05);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.exp(-t * 14);
    out[i] = Math.round(Math.sin(2 * Math.PI * 1250 * (i / SR)) * env * 0.35 * 32767);
  }
  return wav(out);
}

/** Rising pickup blip. */
export function sfxPickup(): Uint8Array {
  const n = Math.floor(SR * 0.14);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.min(1, t * 8) * Math.exp(-t * 5);
    const f = 520 + 620 * t;
    const s = Math.sin(2 * Math.PI * f * (i / SR)) * 0.5 + Math.sin(4 * Math.PI * f * (i / SR)) * 0.2;
    out[i] = Math.round(s * env * 0.4 * 32767);
  }
  return wav(out);
}

/** Hit thud (noise burst + low sine). */
export function sfxHit(): Uint8Array {
  const n = Math.floor(SR * 0.22);
  let noise = 0;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    noise = noise * 0.72 + (Math.random() * 2 - 1) * 0.28;
    const env = Math.exp(-t * 9);
    const thud = Math.sin(2 * Math.PI * 110 * (i / SR)) * Math.exp(-t * 12) * 0.5;
    out[i] = Math.round((noise * 0.35 + thud) * env * 0.5 * 32767);
  }
  return wav(out);
}

// --- Professional GDScript: menu / settings / persistence --------------------

/** Main menu, pause and settings — code-built, pauses the game, persists. */
export function menuScript(spec: GameSpec): string {
  return `extends CanvasLayer
# GameMenu autoload — title screen, pause menu, settings and persistence.
# Professional flow: title -> play -> (Esc pauses) -> resume/quit.

var root: Control
var title_box: VBoxContainer
var rows_box: VBoxContainer
var best_label: Label
var is_open := false
var started := false

const SETTINGS_PATH := "user://settings.cfg"
const SAVE_PATH := "user://save.cfg"

func _ready() -> void:
	layer = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build_ui()
	_apply_saved_settings()
	open_title()

# ---------------------------------------------------------------- UI
func _build_ui() -> void:
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.04, 0.05, 0.08, 0.86)
	root.add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(center)

	title_box = VBoxContainer.new()
	title_box.add_theme_constant_override("separation", 18)
	center.add_child(title_box)

	var title := Label.new()
	title.text = "${spec.title.replace(/"/g, "'").toUpperCase()}"
	title.add_theme_font_size_override("font_size", 46)
	title.add_theme_color_override("font_color", Color("${spec.palette.accent}"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_box.add_child(title)

	best_label = Label.new()
	best_label.text = ""
	best_label.add_theme_font_size_override("font_size", 14)
	best_label.add_theme_color_override("font_color", Color("#8b90a3"))
	best_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_box.add_child(best_label)

	rows_box = VBoxContainer.new()
	rows_box.add_theme_constant_override("separation", 10)
	title_box.add_child(rows_box)

func _make_button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(240, 46)
	b.add_theme_font_size_override("font_size", 18)
	b.pressed.connect(func(): _on_any_button(text))
	return b

func _refresh_menu() -> void:
	for c in rows_box.get_children():
		c.queue_free()
	if not started:
		rows_box.add_child(_make_button("PLAY"))
	else:
		rows_box.add_child(_make_button("RESUME"))
		rows_box.add_child(_make_button("QUIT TO DESKTOP"))
	rows_box.add_child(_make_settings_row())
	var credits := Label.new()
	credits.text = "Nexus Forge build · ${spec.flavor} slice"
	credits.add_theme_font_size_override("font_size", 11)
	credits.add_theme_color_override("font_color", Color("#4a4f66"))
	credits.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rows_box.add_child(credits)

func _make_settings_row() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)

	var vol_label := Label.new()
	vol_label.text = "Volume"
	vol_label.add_theme_color_override("font_color", Color("#8b90a3"))
	row.add_child(vol_label)

	var slider := HSlider.new()
	slider.min_value = 0.0
	slider.max_value = 1.0
	slider.step = 0.05
	slider.custom_minimum_size = Vector2(160, 20)
	slider.value_changed.connect(func(v: float):
		AudioServer.set_bus_volume_db(0, linear_to_db(v))
		AudioServer.set_bus_mute(0, v <= 0.01)
		_save_setting("volume", v)
	)
	row.add_child(slider)
	slider.value = float(_load_setting("volume", 0.8))

	var fs := CheckButton.new()
	fs.text = "Fullscreen"
	fs.toggled.connect(func(on: bool):
		if on:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		else:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		_save_setting("fullscreen", on)
	)
	row.add_child(fs)
	fs.button_pressed = bool(_load_setting("fullscreen", false))
	return row

# ------------------------------------------------------------ flow
func open_title() -> void:
	started = false
	_refresh_menu()
	_show(true)

func open_pause() -> void:
	_refresh_menu()
	_show(true)

func _show(open: bool) -> void:
	is_open = open
	root.visible = open
	get_tree().paused = open
	# 3D games capture the mouse for camera control; menus release it.
	if not open and started:
		if get_viewport().get_camera_3d() != null:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif open:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _on_any_button(action: String) -> void:
	GameState.play_sfx("click")
	if action == "PLAY" or action == "RESUME":
		started = true
		_show(false)
	elif action == "QUIT TO DESKTOP":
		get_tree().quit()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel") and started:
		if is_open:
			_show(false)
		else:
			_refresh_best()
			open_pause()

func _refresh_best() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) == OK:
		best_label.text = "Best run: %d / %d shards" % [int(cfg.get_value("run", "best_score", 0)), GameState.goal]

# ---------------------------------------------------------- persistence
func _save_setting(key: String, value: Variant) -> void:
	var cfg := ConfigFile.new()
	cfg.load(SETTINGS_PATH)
	cfg.set_value("settings", key, value)
	cfg.save(SETTINGS_PATH)

func _load_setting(key: String, fallback: Variant) -> Variant:
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS_PATH) == OK:
		return cfg.get_value("settings", key, fallback)
	return fallback

func _apply_saved_settings() -> void:
	var vol := float(_load_setting("volume", 0.8))
	AudioServer.set_bus_volume_db(0, linear_to_db(vol))
	AudioServer.set_bus_mute(0, vol <= 0.01)
	if _load_setting("fullscreen", false):
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
	_refresh_best()
`;
}

/** Game state additions: SFX playback + best-run persistence (patched into
 *  each template's game_state.gd via marker injection). */
export function gameStateProPatch(): string {
  return `
# ---- professional kit (Nexus): SFX + best-run persistence ----
var _sfx := {}
const SFX_LIB := {
	"pickup": "res://audio/pickup.wav",
	"hit": "res://audio/hit.wav",
	"click": "res://audio/click.wav",
}

func play_sfx(id: String) -> void:
	if not _sfx.has(id):
		var path: String = SFX_LIB.get(id, "")
		if path == "" or not ResourceLoader.exists(path):
			return
		var player := AudioStreamPlayer.new()
		add_child(player)
		player.stream = load(path)
		_sfx[id] = player
	var p: AudioStreamPlayer = _sfx[id]
	p.stop()
	p.play()

func save_best_run() -> void:
	var cfg := ConfigFile.new()
	cfg.load("user://save.cfg")
	var best := int(cfg.get_value("run", "best_score", 0))
	if score > best:
		cfg.set_value("run", "best_score", score)
	cfg.set_value("run", "last_score", score)
	cfg.set_value("run", "runs", int(cfg.get_value("run", "runs", 0)) + 1)
	cfg.save("user://save.cfg")
`;
}
