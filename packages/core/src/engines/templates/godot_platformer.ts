/**
 * 2D platformer starter (metroidvania / precision-platformer flavors).
 * Known-good Celeste-grade feel basics: gravity, coyote time, jump buffer,
 * dash with cooldown, spikes, patrolling enemy, coins, goal gate.
 */
import type { GameSpec } from "../types";
import { projectGodot, godotIgnore, rootScene, iconSvg, hudScript } from "./gd_common";
import { WEB_EXPORT_PRESET } from "../godotExport";

function gameState(spec: GameSpec): string {
  return `extends Node
# Autoload: registers custom actions (code-first input map), holds run state.

signal won
signal died

var score := 0
var goal := ${spec.flavor === "turnbattle" ? 8 : 10}
var health := 100
var elapsed := 0.0
var finished := false

func _ready() -> void:
	if not InputMap.has_action("jump"):
		InputMap.add_action("jump")
		for k in [KEY_SPACE, KEY_Z, KEY_UP]:
			var ev := InputEventKey.new()
			ev.physical_keycode = k
			InputMap.action_add_event("jump", ev)
	if not InputMap.has_action("dash"):
		InputMap.add_action("dash")
		for k in [KEY_SHIFT, KEY_X]:
			var ev := InputEventKey.new()
			ev.physical_keycode = k
			InputMap.action_add_event("dash", ev)

func _process(delta: float) -> void:
	if not finished:
		elapsed += delta
	if finished and Input.is_action_just_pressed("ui_accept"):
		get_tree().reload_current_scene()

func clock_text() -> String:
	var m := int(elapsed) / 60
	var s := int(elapsed) % 60
	return "%02d:%02d" % [m, s]

func add_score(n: int) -> void:
	if finished:
		return
	score += n
	if score >= goal:
		finished = true
		won.emit()

func damage(n: int) -> void:
	if finished:
		return
	health -= n
	if health <= 0:
		health = 0
		finished = true
		died.emit()
`;
}

function playerScript(spec: GameSpec): string {
  return `extends CharacterBody2D
# Platformer controller: gravity, coyote time, jump buffering, dash.

const SPEED := ${spec.playerSpeed}
const JUMP_VELOCITY := -340.0
const GRAVITY := 980.0
const DASH_SPEED := ${Math.round(spec.playerSpeed * 1.9)}
const DASH_TIME := 0.16
const DASH_COOLDOWN := 0.6

var coyote := 0.0
var jump_buffer := 0.0
var dash_timer := 0.0
var dash_cd := 0.0
var facing := 1.0
var visual: ColorRect = null

func _ready() -> void:
	add_to_group("player")
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(22, 30)
	shape.shape = rect
	add_child(shape)

	visual = ColorRect.new()
	visual.name = "Visual"
	visual.size = Vector2(22, 30)
	visual.color = Color("${spec.palette.accent}")
	visual.position = Vector2(-11, -15)
	add_child(visual)

	var cam := Camera2D.new()
	cam.zoom = Vector2(1.4, 1.4)
	cam.position_smoothing_enabled = true
	cam.position_smoothing_speed = 8.0
	add_child(cam)
	cam.make_current()

func _physics_process(delta: float) -> void:
	coyote = max(coyote - delta, 0.0)
	jump_buffer = max(jump_buffer - delta, 0.0)
	dash_timer = max(dash_timer - delta, 0.0)
	dash_cd = max(dash_cd - delta, 0.0)

	if is_on_floor():
		coyote = 0.12
		dash_cd = max(dash_cd, 0.0)

	var dir := Input.get_action_strength("ui_right") - Input.get_action_strength("ui_left")
	if dir != 0.0:
		facing = sign(dir)
		if dash_timer <= 0.0:
			velocity.x = dir * SPEED
	else:
		if dash_timer <= 0.0:
			velocity.x = move_toward(velocity.x, 0.0, SPEED * delta * 12.0)

	if Input.is_action_just_pressed("jump"):
		jump_buffer = 0.12
	if jump_buffer > 0.0 and coyote > 0.0:
		velocity.y = JUMP_VELOCITY
		coyote = 0.0
		jump_buffer = 0.0

	if Input.is_action_just_pressed("dash") and dash_cd <= 0.0 and dash_timer <= 0.0:
		dash_timer = DASH_TIME
		dash_cd = DASH_COOLDOWN
		velocity.x = facing * DASH_SPEED
		velocity.y = 0.0

	if dash_timer > 0.0:
		velocity.y = 0.0
	else:
		if not is_on_floor():
			velocity.y += GRAVITY * delta

	move_and_slide()
	if visual:
		visual.modulate = Color(1, 1, 1) if dash_timer <= 0.0 else Color(0.6, 0.9, 1, 0.7)
`;
}

function patrollerScript(): string {
  return `extends CharacterBody2D
# Patrols between two x bounds, turns at walls, contact damage.

const SPEED := 90.0
var from_x := 0.0
var to_x := 0.0
var dir := 1.0
var hit_cooldown := 0.0
var visual: ColorRect = null

func _ready() -> void:
	add_to_group("hostile")
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(26, 26)
	shape.shape = rect
	add_child(shape)

	visual = ColorRect.new()
	visual.size = Vector2(26, 26)
	visual.color = Color("#e5484d")
	visual.position = Vector2(-13, -13)
	add_child(visual)

func _physics_process(delta: float) -> void:
	hit_cooldown = max(hit_cooldown - delta, 0.0)
	velocity.x = dir * SPEED
	velocity.y += 980.0 * delta
	move_and_slide()
	if is_on_wall():
		dir *= -1.0
	if global_position.x < min(from_x, to_x):
		dir = 1.0
	elif global_position.x > max(from_x, to_x):
		dir = -1.0
	if hit_cooldown <= 0.0:
		var players := get_tree().get_nodes_in_group("player")
		for p in players:
			if global_position.distance_to(p.global_position) < 32.0:
				hits_player()

func hits_player() -> void:
	hit_cooldown = 1.0
	GameState.damage(20)
`;
}

function hazardScript(): string {
  return `extends Area2D
# Deadly zone (spikes). Instant heavy damage on touch.

func _ready() -> void:
	add_to_group("hazard")
	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		GameState.damage(100)
`;
}

function coinScript(spec: GameSpec): string {
  return `extends Area2D
# Coin collectible with spin-in-place animation.

var spin := 0.0

func _ready() -> void:
	add_to_group("coin")
	var shape := CollisionShape2D.new()
	var circ := CircleShape2D.new()
	circ.radius = 14.0
	shape.shape = circ
	add_child(shape)

	var vis := ColorRect.new()
	vis.size = Vector2(10, 10)
	vis.color = Color("${spec.palette.accent}")
	vis.position = Vector2(-5, -5)
	add_child(vis)

	body_entered.connect(_on_body_entered)

func _process(delta: float) -> void:
	spin += delta * 3.0
	rotation = spin

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		GameState.add_score(1)
		queue_free()
`;
}

function goalScript(): string {
  return `extends Area2D
# Goal gate — win when enough coins were collected.

func _ready() -> void:
	add_to_group("goal")
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(20, 90)
	shape.shape = rect
	add_child(shape)

	var vis := ColorRect.new()
	vis.size = Vector2(20, 90)
	vis.color = Color(0.35, 0.95, 0.6, 0.55)
	vis.position = Vector2(-10, -45)
	add_child(vis)

	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		if GameState.score >= GameState.goal:
			GameState.add_score(GameState.goal)
		else:
			hud_hint()

func hud_hint() -> void:
	var huds := get_tree().get_nodes_in_group("hud")
	for h in huds:
		if h.has_method("show_message"):
			h.show_message("Need %d coins!" % (GameState.goal - GameState.score))
			get_tree().create_timer(1.5).timeout.connect(func(): h.show_message(""))
`;
}

function mainPlatformer(spec: GameSpec): string {
  return `extends Node
# Builds a side-view gauntlet: start ground, floating platforms, spikes,
# a patroller lane and a goal gate on the far platform.

const SKY := Color("${spec.palette.bg}")
var player: CharacterBody2D
var hud: CanvasLayer

func _ready() -> void:
	randomize()
	var bg := ColorRect.new()
	bg.color = SKY
	bg.size = Vector2(3200, 900)
	bg.z_index = -10
	add_child(bg)

	_build_platform(Vector2(-200, 140), Vector2(500, 40), "#2a3040")
	_build_platform(Vector2(480, 80), Vector2(180, 30), "#2a3040")
	_build_platform(Vector2(780, 20), Vector2(160, 30), "#2a3040")
	_build_platform(Vector2(1050, -40), Vector2(200, 30), "#2a3040")
	_build_platform(Vector2(1400, 40), Vector2(240, 30), "#2a3040")
	_build_platform(Vector2(1750, -20), Vector2(500, 40), "#2a3040")

	_build_hazard(Vector2(620, 155), Vector2(140, 26))
	_build_hazard(Vector2(1120, -10), Vector2(120, 22))
	_build_hazard(Vector2(1330, 175), Vector2(160, 26))

	_spawn_patroller(Vector2(1380, 10), Vector2(1620, 10))
	_spawn_patroller(Vector2(0, 105), Vector2(240, 105))

	_spawn_coins()
	_spawn_goal(Vector2(1950, -70))

	player = preload("res://scenes/player.tscn").instantiate()
	player.position = Vector2(-100, 60)
	add_child(player)

	hud = preload("res://scripts/hud.gd").new()
	add_child(hud)
	GameState.won.connect(_on_won)
	GameState.died.connect(_on_died)

func _process(_delta: float) -> void:
	pass

func _build_platform(pos: Vector2, size: Vector2, color: String) -> void:
	var body := StaticBody2D.new()
	body.position = pos
	add_child(body)
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape.shape = rect
	body.add_child(shape)
	var vis := ColorRect.new()
	vis.size = size
	vis.color = Color(color)
	vis.position = size / -2.0
	body.add_child(vis)

func _build_hazard(pos: Vector2, size: Vector2) -> void:
	var hazard := preload("res://scenes/hazard.tscn").instantiate()
	hazard.position = pos
	add_child(hazard)
	var vis := ColorRect.new()
	vis.size = size
	vis.color = Color("#e5484d")
	vis.position = size / -2.0
	hazard.add_child(vis)
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	shape.shape = rect
	hazard.add_child(shape)

func _spawn_patroller(a: Vector2, b: Vector2) -> void:
	var enemy := preload("res://scenes/enemy.tscn").instantiate()
	enemy.position = a
	enemy.from_x = a.x
	enemy.to_x = b.x
	add_child(enemy)

func _spawn_coins() -> void:
	var spots := [
		Vector2(460, 40), Vector2(520, 40), Vector2(760, -20), Vector2(820, -20),
		Vector2(1030, -80), Vector2(1090, -80), Vector2(1150, -80),
		Vector2(1380, -10), Vector2(1440, -10), Vector2(1500, -10), Vector2(1560, -10),
		Vector2(-40, 60), Vector2(0, 60), Vector2(40, 60),
	]
	for s in spots:
		var coin := preload("res://scenes/coin.tscn").instantiate()
		coin.position = s
		add_child(coin)

func _spawn_goal(pos: Vector2) -> void:
	var goal := preload("res://scenes/goal.tscn").instantiate()
	goal.position = pos
	add_child(goal)

func _on_won() -> void:
	hud.show_message("AREA CLEARED\\npress ENTER to run again")

func _on_died() -> void:
	hud.show_message("YOU FELL\\npress ENTER to retry")
`;
}

export function platformerFiles(spec: GameSpec): Record<string, string> {
  return {
    "project.godot": projectGodot(spec),
    ".gitignore": godotIgnore(),
    "export_presets.cfg": WEB_EXPORT_PRESET,
    "icon.svg": iconSvg(spec.palette.bg, spec.palette.accent),
    "scenes/main.tscn": rootScene("Main", "Node", "res://scripts/main.gd"),
    "scenes/player.tscn": rootScene("Player", "CharacterBody2D", "res://scripts/player.gd"),
    "scenes/enemy.tscn": rootScene("Patroller", "CharacterBody2D", "res://scripts/enemy.gd"),
    "scenes/hazard.tscn": rootScene("Hazard", "Area2D", "res://scripts/hazard.gd"),
    "scenes/coin.tscn": rootScene("Coin", "Area2D", "res://scripts/coin.gd"),
    "scenes/goal.tscn": rootScene("Goal", "Area2D", "res://scripts/goal.gd"),
    "scripts/game_state.gd": gameState(spec),
    "scripts/main.gd": mainPlatformer(spec),
    "scripts/player.gd": playerScript(spec),
    "scripts/enemy.gd": patrollerScript(),
    "scripts/hazard.gd": hazardScript(),
    "scripts/coin.gd": coinScript(spec),
    "scripts/goal.gd": goalScript(),
    "scripts/hud.gd": hudScript(spec),
    "docs/README.md": `# ${spec.title}\n\n${spec.shortDescription}\n\n## Controls\n- Move: arrows/WASD\n- Jump: Space / Z / Up\n- Dash: Shift / X\n- Restart after end: ENTER\n`,
  };
}
