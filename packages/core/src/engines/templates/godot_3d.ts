/**
 * 3D starter (survival-craft / open-world-action / fps / session-horror).
 * Third-person capsule hero, ground, scattered rocks, orbiting shards,
 * chaser enemies, day/night sky lerp. Everything code-built.
 */
import type { GameSpec } from "../types";
import { projectGodot, godotIgnore, rootScene, iconSvg, hudScript } from "./gd_common";
import { WEB_EXPORT_PRESET } from "../godotExport";

function gameState(spec: GameSpec): string {
  return `extends Node
# Autoload for the 3D slice: registers actions, holds state.

signal raid_started
signal won
signal died

var score := 0
var goal := 10
var health := 100
var elapsed := 0.0
var finished := false
var raid_done := false
const RAID_AT := 45.0

func _ready() -> void:
	if not InputMap.has_action("sprint"):
		InputMap.add_action("sprint")
		for k in [KEY_SHIFT, KEY_R]:
			var ev := InputEventKey.new()
			ev.physical_keycode = k
			InputMap.action_add_event("sprint", ev)

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

func day_phase() -> float:
	return 0.5 + 0.5 * sin(elapsed / 30.0)

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
  return `extends CharacterBody3D
# Third-person hero: camera pivot with mouse orbit, sprint, gravity.

const SPEED := ${spec.playerSpeed}
const SPRINT_MULT := 1.7
const JUMP_VELOCITY := 4.6
const GRAVITY := 9.8

var yaw := 0.0
var pitch := 0.0
var cam_pivot: Node3D = null

func _ready() -> void:
	add_to_group("player")
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.4
	capsule.height = 1.4
	shape.shape = capsule
	add_child(shape)

	var mesh := MeshInstance3D.new()
	var capsule_mesh := CapsuleMesh.new()
	capsule_mesh.radius = 0.4
	capsule_mesh.height = 1.4
	mesh.mesh = capsule_mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("${spec.palette.accent}")
	mesh.material_override = mat
	add_child(mesh)

	cam_pivot = Node3D.new()
	cam_pivot.name = "CameraPivot"
	add_child(cam_pivot)
	var cam := Camera3D.new()
	cam.position = Vector3(0, 4.2, 6.5)
	cam_pivot.add_child(cam)
	cam.make_current()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		yaw -= event.relative.x * 0.003
		pitch = clamp(pitch - event.relative.y * 0.003, -0.5, 0.35)
		cam_pivot.rotation = Vector3(pitch, yaw, 0)
	if event.is_action_pressed("ui_cancel"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	if Input.is_action_just_pressed("ui_accept") and is_on_floor():
		velocity.y = JUMP_VELOCITY

	var input_dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	var basis_y := Basis(Vector3.UP, yaw)
	var dir := (basis_y * Vector3(input_dir.x, 0, input_dir.y)).normalized()
	var speed := SPEED * (SPRINT_MULT if Input.is_action_pressed("sprint") else 1.0)
	velocity.x = dir.x * speed
	velocity.z = dir.z * speed
	move_and_slide()
`;
}

function enemyScript(spec: GameSpec): string {
  return `extends CharacterBody3D
# 3D chaser with contact damage (visual + physics built in code).

const SPEED := ${Math.round(spec.playerSpeed * 0.6)}
var target: Node3D = null
var hit_cooldown := 0.0

func _ready() -> void:
	add_to_group("hostile")
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(0.9, 0.9, 0.9)
	shape.shape = box
	add_child(shape)

	var mesh := MeshInstance3D.new()
	var box_mesh := BoxMesh.new()
	box_mesh.size = Vector3(0.9, 0.9, 0.9)
	mesh.mesh = box_mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("#e5484d")
	mesh.material_override = mat
	add_child(mesh)

func _physics_process(delta: float) -> void:
	hit_cooldown = max(hit_cooldown - delta, 0.0)
	if target == null or not is_instance_valid(target):
		return
	var to_target := target.global_position - global_position
	to_target.y = 0.0
	if to_target.length() < 1.2 and hit_cooldown <= 0.0:
		hits_player()
	elif to_target.length() > 0.1:
		var dir := to_target.normalized()
		velocity.x = dir.x * SPEED
		velocity.z = dir.z * SPEED
		look_at(Vector3(target.global_position.x, global_position.y, target.global_position.z))
	else:
		velocity.x = 0.0
		velocity.z = 0.0
	if not is_on_floor():
		velocity.y -= 9.8 * delta
	move_and_slide()

func hits_player() -> void:
	hit_cooldown = 1.0
	GameState.damage(10)
`;
}

function collectibleScript(spec: GameSpec): string {
  return `extends Area3D
# Floating shard: bob + spin, pickup by proximity.

var t := 0.0

func _ready() -> void:
	add_to_group("shard")
	var shape := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 0.7
	shape.shape = sphere
	add_child(shape)

	var mesh := MeshInstance3D.new()
	var s := SphereMesh.new()
	s.radius = 0.22
	s.height = 0.44
	mesh.mesh = s
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("${spec.palette.accent}")
	mat.emission_enabled = true
	mat.emission = Color("${spec.palette.accent}")
	mat.emission_energy_multiplier = 1.4
	mesh.material_override = mat
	add_child(mesh)

	body_entered.connect(_on_body_entered)

func _process(delta: float) -> void:
	t += delta
	position.y += sin(t * 3.0) * 0.004
	rotate_y(delta * 2.0)

func _on_body_entered(body: Node3D) -> void:
	if body.is_in_group("player"):
		GameState.add_score(1)
		queue_free()
`;
}

function main3d(spec: GameSpec): string {
  return `extends Node
# 3D world: environment, light, ground, rocks, hero, hostiles, shards, HUD.

const WORLD := 60.0
var player: CharacterBody3D
var hud: CanvasLayer
var world_env: WorldEnvironment = null
var dir_light: DirectionalLight3D = null
var sky_base := Color("${spec.palette.bg}")

func _ready() -> void:
	randomize()
	_build_environment()
	_build_ground()
	_build_rocks()
	_spawn_player()
	_spawn_shards(12)
	_spawn_enemies(3)
	hud = preload("res://scripts/hud.gd").new()
	add_child(hud)
	GameState.raid_started.connect(_on_raid)
	GameState.won.connect(_on_won)
	GameState.died.connect(_on_died)

func _process(_delta: float) -> void:
	if world_env and world_env.environment:
		var phase := GameState.day_phase()
		world_env.environment.background_color = sky_base.lerp(Color("#05060a"), clamp(1.0 - phase, 0.0, 0.8))
	if dir_light:
		dir_light.light_energy = 0.5 + 0.7 * GameState.day_phase()
	if GameState.finished and Input.is_action_just_pressed("ui_accept"):
		get_tree().reload_current_scene()

func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = sky_base
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.45, 0.5, 0.6)
	env.ambient_light_energy = 1.1
	env.fog_enabled = true
	env.fog_light_color = sky_base
	env.fog_density = 0.006
	world_env = WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	dir_light = DirectionalLight3D.new()
	dir_light.rotation_degrees = Vector3(-48, -30, 0)
	dir_light.shadow_enabled = true
	dir_light.light_energy = 1.1
	add_child(dir_light)

func _build_ground() -> void:
	var body := StaticBody3D.new()
	add_child(body)
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(WORLD * 2, 2, WORLD * 2)
	shape.shape = box
	body.add_child(shape)

	var mesh := MeshInstance3D.new()
	var ground_mesh := BoxMesh.new()
	ground_mesh.size = Vector3(WORLD * 2, 2, WORLD * 2)
	mesh.mesh = ground_mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("#20242e")
	mesh.material_override = mat
	mesh.position = Vector3(0, -1, 0)
	add_child(mesh)

func _build_rocks() -> void:
	for i in 10:
		var body := StaticBody3D.new()
		var pos := Vector3(
			randf_range(-WORLD + 6, WORLD - 6),
			0.4,
			randf_range(-WORLD + 6, WORLD - 6)
		)
		body.position = pos
		var shape := CollisionShape3D.new()
		var box := BoxShape3D.new()
		var size := Vector3(randf_range(1.0, 3.4), randf_range(0.8, 2.4), randf_range(1.0, 3.4))
		box.size = size
		shape.shape = box
		body.add_child(shape)
		var mesh := MeshInstance3D.new()
		var rock := BoxMesh.new()
		rock.size = size
		mesh.mesh = rock
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color("#2e3342")
		mesh.material_override = mat
		body.add_child(mesh)
		add_child(body)

func _spawn_player() -> void:
	player = preload("res://scenes/player.tscn").instantiate()
	player.position = Vector3(0, 1.2, 0)
	add_child(player)

func _spawn_shards(count: int) -> void:
	for i in count:
		var shard := preload("res://scenes/collectible.tscn").instantiate()
		shard.position = Vector3(
			randf_range(-WORLD + 8, WORLD - 8),
			1.0,
			randf_range(-WORLD + 8, WORLD - 8)
		)
		add_child(shard)

func _spawn_enemies(count: int) -> void:
	for i in count:
		var enemy := preload("res://scenes/enemy.tscn").instantiate()
		var edge := randi() % 4
		var pos := Vector3.ZERO
		match edge:
			0: pos = Vector3(randf_range(-WORLD, WORLD), 1.0, -WORLD + 5)
			1: pos = Vector3(randf_range(-WORLD, WORLD), 1.0, WORLD - 5)
			2: pos = Vector3(-WORLD + 5, 1.0, randf_range(-WORLD, WORLD))
			_: pos = Vector3(WORLD - 5, 1.0, randf_range(-WORLD, WORLD))
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
	hud.show_message("SYSTEMS OFFLINE\\npress ENTER to restart")
`;
}

export function threeDFiles(spec: GameSpec): Record<string, string> {
  return {
    "project.godot": projectGodot(spec),
    ".gitignore": godotIgnore(),
    "export_presets.cfg": WEB_EXPORT_PRESET,
    "icon.svg": iconSvg(spec.palette.bg, spec.palette.accent),
    "scenes/main.tscn": rootScene("Main", "Node", "res://scripts/main.gd"),
    "scenes/player.tscn": rootScene("Player", "CharacterBody3D", "res://scripts/player.gd"),
    "scenes/enemy.tscn": rootScene("Enemy", "CharacterBody3D", "res://scripts/enemy.gd"),
    "scenes/collectible.tscn": rootScene("Shard", "Area3D", "res://scripts/collectible.gd"),
    "scripts/game_state.gd": gameState(spec),
    "scripts/main.gd": main3d(spec),
    "scripts/player.gd": playerScript(spec),
    "scripts/enemy.gd": enemyScript(spec),
    "scripts/collectible.gd": collectibleScript(spec),
    "scripts/hud.gd": hudScript(spec),
    "docs/README.md": `# ${spec.title}\n\n${spec.shortDescription}\n\n## Controls\n- WASD/arrows: move (camera-relative)\n- Mouse: orbit camera (click captures)\n- Space: jump\n- Shift: sprint\n- ENTER: restart after end\n`,
  };
}
