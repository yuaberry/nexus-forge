/**
 * 2D top-down starter template (colony-survival / arpg / rts / pixel-mmorpg).
 * A REAL playable loop: explore, collect shards, survive the raid, win/lose.
 * All visuals are code-built placeholders (no binary assets — honest).
 */
import type { GameSpec } from "../types";
import { projectGodot, godotIgnore, rootScene, iconSvg, hudScript } from "./gd_common";

function gameState(spec: GameSpec): string {
  return `extends Node
# Global game state (autoload). Single source of truth for win/lose/economy.

signal raid_started
signal won
signal died

var score := 0
var goal := ${spec.flavor === "topdown" ? 10 : 8}
var health := 100
var elapsed := 0.0
var finished := false
var raid_done := false
const RAID_AT := ${spec.flavor === "topdown" ? "40.0" : "50.0"}

func _process(delta: float) -> void:
	if finished:
		return
	elapsed += delta
	if not raid_done and elapsed >= RAID_AT:
		raid_done = true
		raid_started.emit()

func clock_text() -> String:
	var h := (int(elapsed / 60.0) + 8) % 24
	var m := int(elapsed) % 60
	return "%02d:%02d" % [h, m]

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

func day_phase() -> float:
	# 0..1..0 sine of time for day/night tinting
	return 0.5 + 0.5 * sin(elapsed / 30.0)
`;
}

function playerScript(spec: GameSpec): string {
  return `extends CharacterBody2D
# 8-direction top-down controller with camera and damage flash.

const SPEED := ${spec.playerSpeed}
var damage_cooldown := 0.0
var visual: ColorRect = null

func _ready() -> void:
	add_to_group("player")
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(26, 26)
	shape.shape = rect
	add_child(shape)

	visual = ColorRect.new()
	visual.name = "Visual"
	visual.size = Vector2(26, 26)
	visual.color = Color("${spec.palette.accent}")
	visual.position = Vector2(-13, -13)
	add_child(visual)

	var cam := Camera2D.new()
	cam.zoom = Vector2(1.6, 1.6)
	cam.position_smoothing_enabled = true
	cam.position_smoothing_speed = 6.0
	add_child(cam)
	cam.make_current()

func _physics_process(delta: float) -> void:
	damage_cooldown = max(damage_cooldown - delta, 0.0)
	var input := Vector2(
		Input.get_action_strength("ui_right") - Input.get_action_strength("ui_left"),
		Input.get_action_strength("ui_down") - Input.get_action_strength("ui_up")
	).normalized()
	velocity = input * SPEED
	move_and_slide()
	if visual:
		visual.modulate = Color(1, 1, 1) if damage_cooldown <= 0.0 else Color(1, 0.4, 0.4)
`;
}

function enemyScript(spec: GameSpec): string {
  return `extends CharacterBody2D
# Chaser with contact damage on cooldown (respect the player, no touch of death).

const SPEED := ${Math.round(spec.playerSpeed * 0.55)}
var target: Node2D = null
var hit_cooldown := 0.0

func _ready() -> void:
	add_to_group("hostile")
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(24, 24)
	shape.shape = rect
	add_child(shape)

	var vis := ColorRect.new()
	vis.size = Vector2(24, 24)
	vis.color = Color("#e5484d")
	vis.position = Vector2(-12, -12)
	add_child(vis)

func _physics_process(delta: float) -> void:
	hit_cooldown = max(hit_cooldown - delta, 0.0)
	if target == null or not is_instance_valid(target):
		velocity = Vector2.ZERO
		move_and_slide()
		return
	var dir := (target.global_position - global_position).normalized()
	velocity = dir * SPEED
	move_and_slide()
	if hit_cooldown <= 0.0 and global_position.distance_to(target.global_position) < 30.0:
		hits_player()

func hits_player() -> void:
	hit_cooldown = 0.9
	GameState.damage(8)
`;
}

function collectibleScript(spec: GameSpec): string {
  return `extends Area2D
# Shard collectible: spin animation, pickup by player, +1 score.

var spin := randf() * 6.0

func _ready() -> void:
	add_to_group("shard")
	var shape := CollisionShape2D.new()
	var circ := CircleShape2D.new()
	circ.radius = 16.0
	shape.shape = circ
	add_child(shape)

	var vis := ColorRect.new()
	vis.size = Vector2(12, 12)
	vis.color = Color("${spec.palette.accent}")
	vis.position = Vector2(-6, -6)
	add_child(vis)

	body_entered.connect(_on_body_entered)

func _process(delta: float) -> void:
	spin += delta * 2.0
	rotation = spin

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		GameState.add_score(1)
		queue_free()
`;
}

function mainTopdown(spec: GameSpec): string {
  return `extends Node
# World builder: arena, walls, obstacles, player, hostiles, shards, HUD.
# Everything is created from code — the scene file stays minimal.

const WORLD := ${spec.flavor === "topdown" ? "Vector2(1600, 1200)" : "Vector2(1400, 1000)"}
const WALL := 40.0

var player: CharacterBody2D
var ground: ColorRect
var hud: CanvasLayer
var ground_base := Color("${spec.palette.bg}")

func _ready() -> void:
	randomize()
	_build_arena()
	_spawn_player()
	_spawn_shards(${spec.flavor === "topdown" ? 12 : 10})
	_spawn_enemies(${spec.flavor === "topdown" ? 3 : 4})
	hud = preload("res://scripts/hud.gd").new()
	add_child(hud)
	GameState.raid_started.connect(_on_raid)
	GameState.won.connect(_on_won)
	GameState.died.connect(_on_died)

func _process(_delta: float) -> void:
	# day/night tint on the ground
	if ground:
		var phase := GameState.day_phase()
		ground.color = ground_base.lerp(Color("#101014"), clamp(1.0 - phase, 0.0, 0.55))
	if GameState.finished and Input.is_action_just_pressed("ui_accept"):
		get_tree().reload_current_scene()

func _build_arena() -> void:
	ground = ColorRect.new()
	ground.size = WORLD
	ground.color = ground_base
	add_child(ground)

	var borders := StaticBody2D.new()
	borders.position = WORLD / 2.0
	add_child(borders)
	# four walls around the arena
	var wall_defs := [
		[Vector2(0, -WORLD.y / 2 + WALL / 2), Vector2(WORLD.x, WALL)],
		[Vector2(0, WORLD.y / 2 - WALL / 2), Vector2(WORLD.x, WALL)],
		[Vector2(-WORLD.x / 2 + WALL / 2, 0), Vector2(WALL, WORLD.y)],
		[Vector2(WORLD.x / 2 - WALL / 2, 0), Vector2(WALL, WORLD.y)],
	]
	for def in wall_defs:
		var body := CollisionShape2D.new()
		body.position = def[0]
		var rect := RectangleShape2D.new()
		rect.size = def[1]
		body.shape = rect
		borders.add_child(body)
		var vis := ColorRect.new()
		vis.size = def[1]
		vis.color = Color("#3a3f4a")
		vis.position = Vector2(def[1].x / -2.0, def[1].y / -2.0)
		body.add_child(vis)

	# scattered obstacles for cover
	for i in 8:
		var obs := StaticBody2D.new()
		obs.position = Vector2(
			randf_range(-WORLD.x / 2 + 120, WORLD.x / 2 - 120),
			randf_range(-WORLD.y / 2 + 120, WORLD.y / 2 - 120)
		)
		var size := Vector2(randf_range(60, 160), randf_range(60, 160))
		var shape := CollisionShape2D.new()
		var rect := RectangleShape2D.new()
		rect.size = size
		shape.shape = rect
		obs.add_child(shape)
		var vis := ColorRect.new()
		vis.size = size
		vis.color = Color("#24283a")
		vis.position = size / -2.0
		obs.add_child(vis)
		add_child(obs)

func _spawn_player() -> void:
	player = preload("res://scenes/player.tscn").instantiate()
	player.position = Vector2(0, 0)
	add_child(player)

func _spawn_shards(count: int) -> void:
	for i in count:
		var shard := preload("res://scenes/collectible.tscn").instantiate()
		shard.position = Vector2(
			randf_range(-WORLD.x / 2 + 80, WORLD.x / 2 - 80),
			randf_range(-WORLD.y / 2 + 80, WORLD.y / 2 - 80)
		)
		add_child(shard)

func _spawn_enemies(count: int) -> void:
	for i in count:
		var enemy := preload("res://scenes/enemy.tscn").instantiate()
		var edge := randi() % 4
		var pos := Vector2.ZERO
		match edge:
			0: pos = Vector2(randf_range(-WORLD.x/2, WORLD.x/2), -WORLD.y/2 + 80)
			1: pos = Vector2(randf_range(-WORLD.x/2, WORLD.x/2), WORLD.y/2 - 80)
			2: pos = Vector2(-WORLD.x/2 + 80, randf_range(-WORLD.y/2, WORLD.y/2))
			_: pos = Vector2(WORLD.x/2 - 80, randf_range(-WORLD.y/2, WORLD.y/2))
		enemy.position = pos
		enemy.target = player
		add_child(enemy)

func _on_raid() -> void:
	hud.show_message("RAID INBOUND")
	_spawn_enemies(5)
	get_tree().create_timer(2.2).timeout.connect(func(): hud.show_message(""))

func _on_won() -> void:
	hud.show_message("SECTOR STABILIZED\\npress ENTER to restart")

func _on_died() -> void:
	hud.show_message("COLONY LOST\\npress ENTER to restart")
`;
}

export function topdownFiles(spec: GameSpec): Record<string, string> {
  return {
    "project.godot": projectGodot(spec),
    ".gitignore": godotIgnore(),
    "icon.svg": iconSvg(spec.palette.bg, spec.palette.accent),
    "scenes/main.tscn": rootScene("Main", "Node", "res://scripts/main.gd"),
    "scenes/player.tscn": rootScene("Player", "CharacterBody2D", "res://scripts/player.gd"),
    "scenes/enemy.tscn": rootScene("Enemy", "CharacterBody2D", "res://scripts/enemy.gd"),
    "scenes/collectible.tscn": rootScene("Shard", "Area2D", "res://scripts/collectible.gd"),
    "scripts/game_state.gd": gameState(spec),
    "scripts/main.gd": mainTopdown(spec),
    "scripts/player.gd": playerScript(spec),
    "scripts/enemy.gd": enemyScript(spec),
    "scripts/collectible.gd": collectibleScript(spec),
    "scripts/hud.gd": hudScript(spec),
    "docs/README.md": `# ${spec.title}\n\n${spec.shortDescription}\n\nGenerated by Nexus Forge as a playable prototype slice.\n\n## Controls\n- Arrow keys / WASD (ui_* actions): move\n- ENTER: restart after end\n\nRun with the Godot 4 editor, or:\n\`\`\`\ngodot --path .\n\`\`\`\n`,
  };
}
