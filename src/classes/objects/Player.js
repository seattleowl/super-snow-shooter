import { onDeath } from "../../io.js";
import UpdatedScene from "../template/scenes/UpdatedScene.js";
import PowerUp from "./PowerUp.js";
import Present from "./Present.js";
import Snowball from "./Snowball.js";

export default class Player extends Phaser.GameObjects.Container {
	static SPEED = 140;
	static CROUCH_SPEED = 35;
	static JUMP_HEIGHT = 250;
	static FIRE_VELOCITY = 300;
	static SLIDE_SPEED = 50;
	/** @type {Player} */
	static local = null;

	isLocal = false;
	keys = null;
	anim = "idle";
	flip = false;
	textureID = null;
	textureName = "null";
	recoil = 0;
	sliding = false;
	launch = 0;
	crouch = false;
	snowballs = [];
	invincible = false;
	flash = 0;
	spawns = [];
	hit = false;
	collider = null;
	respawn = null;

	/** @type {Phaser.GameObjects.Sprite} */
	sprite = null;
	/** @type {Phaser.GameObjects.BitmapText} */
	nameTag = null;

	/**
	 * Creates an instance of Player.
	 * @param {UpdatedScene} scene
	 * @param {number} x
	 * @param {number} y
	 * @param {number} skin
	 * @param {boolean} [local=false]
	 * @memberof Player
	 */
	constructor(scene, x, y, skin, name, spawns = [], local = false) {
		const sprite = scene.add.sprite(0, -4, `player${skin}`);
		const nameTag = scene.add
			.bitmapText(0, -16, "zepto-name-tag", name, 8)
			.setOrigin(0.5, 1);

		super(scene, x, y, [sprite, nameTag]);

		scene.add.existing(this);
		scene.updateObj(this);

		this.sprite = sprite;
		this.nameTag = nameTag;

		if (local) {
			this.setSize(9, 16);
			scene.physics.world.enable(this);
			scene.physics.add.existing(this);

			this.isLocal = true;
			this.keys = this.scene.input.keyboard.addKeys(
				"W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,E"
			);
			Player.local = this;
			this.spawns = spawns;

			this.body.setCollideWorldBounds(true);

			this.nameTag.setVisible(false);

			onDeath(() => {
				this.hit = true;
				this.anim = "hit";
				this.collider.active = false;
				this.body.setVelocity(0, -Player.JUMP_HEIGHT / 2);
				this.body.setCollideWorldBounds(false);
				this.scene.cameras.main.stopFollow();
				this.respawn = setTimeout(() => {
					this.collider.active = true;
					this.hit = false;
					this.body.setVelocity(0);
					this.body.setCollideWorldBounds(true);
					setTimeout(() => {
						this.scene.cameras.main.startFollow(this);
						this.spawn();
					}, 50);
				}, 2000);
			});
		}

		this.textureID = skin;
		this.textureName = skin === 0 ? `player1` : `player${skin}`;
	}

	update() {
		if (this.isLocal) {
			if (!this.hit) {
				const input = Object.fromEntries(
					Object.entries(this.keys).map(([name, { isDown }]) => [name, isDown])
				);
				input.A = input.A || input.LEFT;
				input.S = input.S || input.DOWN;
				input.D = input.D || input.RIGHT;
				input.W = input.W || input.UP;

				const direction = input.D - input.A;

				// If invincible and a key has been pressed
				if (this.invincible && Object.values(input).reduce((a, b) => a || b)) {
					// Turn off invincibility
					this.invincible = false;
					this.sprite.setVisible(true);
				}

				if (this.launch <= 0 && !this.crouch)
					this.body.setVelocityX(PowerUp.getStat("SPEED") * direction);
				else if (this.launch > 0) this.launch--;
				else if (this.crouch)
					this.body.setVelocityX(PowerUp.getStat("CROUCH_SPEED") * direction);

				this.crouch = input.SHIFT;

				if (this.body.onFloor() && input.W) {
					this.body.setVelocityY(-PowerUp.getStat("JUMP_HEIGHT"));
					this.scene.particles.jump.createEmitter({
						...this.scene.particles.config.jump,
						x: this.x,
						y: this.y
					});
				}

				this.sliding =
					!this.body.onFloor() &&
					((this.body.blocked.right && input.D) ||
						(this.body.blocked.left && input.A));

				if (this.sliding) {
					if (this.body.velocity.y > 0)
						this.body.setVelocityY(PowerUp.getStat("SLIDE_SPEED"));
					if (input.W) {
						this.body.setVelocity(
							PowerUp.getStat("SPEED") * -direction,
							-PowerUp.getStat("JUMP_HEIGHT")
						);
						this.launch = 20;
						this.scene.particles.jump.createEmitter({
							...this.scene.particles.config.jump,
							x: this.x + direction * -3,
							y: this.y,
							rotate: direction > 0 ? 270 : 90
						});
					}
				}

				if (input.S || input.SPACE) {
					if (this.recoil === 0) {
						this.recoil = 10;
						this.snowballs.push(
							new Snowball(
								this.scene,
								this.x,
								this.y + 2,
								[
									PowerUp.getStat("FIRE_VELOCITY") *
										-(
											(this.sliding ? !this.sprite.flipX : this.sprite.flipX) *
												2 -
											1
										),
									this.body.velocity.y / 10
								],
								this
							)
						);
					}
				} else if (this.recoil > 0 && !input.E) {
					this.recoil--;
				}

				if (input.E) {
					if (PowerUp.getFlag("SHOOT_PRESENTS") && this.recoil === 0) {
						this.snowballs.push(
							new Present(
								this.scene,
								this.x,
								this.y + 2,
								[
									(PowerUp.getStat("FIRE_VELOCITY") / 2) *
										-(
											(this.sliding ? !this.sprite.flipX : this.sprite.flipX) *
												2 -
											1
										),
									this.body.velocity.y / 10 +
										-PowerUp.getStat("FIRE_VELOCITY") / 1.5
								],
								this
							)
						);
						this.recoil = 50;
					}
				}

				if (this.body.onFloor()) {
					if (input.D || input.A) this.anim = "walk";
					else if (this.recoil > 8) this.anim = "shoot";
					else this.anim = "idle";
				} else {
					if (this.body.velocity.y > 0) {
						if (this.sliding) this.anim = "slide";
						else this.anim = "fall";
					} else this.anim = "jump";
				}

				this.flip = { "-1": true, 0: this.flip, 1: false }[
					this.crouch ? direction : Math.sign(this.body.velocity.x)
				];
			}
		}

		this.sprite.play(`${this.textureName}.${this.anim}`, true);
		this.sprite.setFlipX(this.flip);

		if (this.invincible) {
			this.flash++;
			this.sprite.setVisible(this.flash > 10);
			if (this.flash === 20) this.flash = 0;
		}
	}

	get frameData() {
		const { anim, flip, x, y, textureID, invincible } = this;
		const snowballs = this.snowballs.map((obj) => ({
			x: obj.x,
			y: obj.y,
			type: obj.constructor.name.toLowerCase()
		}));

		return {
			anim,
			flip,
			x,
			y,
			textureID,
			snowballs,
			invincible
		};
	}

	set frameData(data) {
		const { anim, flip, x, y, snowballs, invincible, name, textureID } = data;
		this.anim = anim;
		this.flip = flip;
		this.x = x;
		this.y = y;

		if (this.nameTag.text === "" && name !== "") {
			this.nameTag.setText(name);
		}

		if (this.textureID === 0 && textureID !== 0) {
			this.textureID = textureID;
			this.textureName = `player${this.textureID}`;
		}

		if (!invincible && this.invincible)
			// When turning off invincibility, make sure they dont get invisibility
			this.sprite.setVisible(true);
		this.invincible = invincible;

		this.#updateSnowballs(snowballs);
		snowballs.forEach(({ x, y }, i) => {
			this.snowballs[i].x = x;
			this.snowballs[i].y = y;
		});
	}

	#updateSnowballs(snowballs) {
		if (snowballs.length > this.snowballs.length) {
			const sb = snowballs[this.snowballs.length];
			this.snowballs.push(
				new (sb.type === "snowball" ? Snowball : Present)(
					this.scene,
					sb.x,
					sb.y
				)
			);
		} else if (snowballs.length < this.snowballs.length) {
			this.snowballs.splice(-1)[0].destroy();
		}
	}

	spawn() {
		const spawn = this.spawns[Math.floor(Math.random() * this.spawns.length)];
		this.setPosition(spawn.x, spawn.y);
		this.invincible = true;
	}

	setCollider(collider) {
		this.collider = collider;
	}

	cancelRespawn() {
		if (this.respawn) clearTimeout(this.respawn);
	}
}
