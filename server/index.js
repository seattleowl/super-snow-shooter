import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";
import { ERROR } from "../errorCodes.mjs";

const PORT = process.env.PORT ?? 3000;
const debug = process.env.DEVELOP === "true";

const app = express();
const httpServer = createServer(app);
/** @type {Server} */
const io = new Server(httpServer, {
	cors: {
		origin: debug ? "http://localhost:5500" : "https://www.mageowlstudios.com",
		methods: ["GET", "POST"]
	}
});

const games = { solo: {} };
const gamemode = { TOTEM_STEAL: 0, FREE_FOR_ALL: 0, TEAM_2: 1, TEAM_4: 2 };

function generateID() {
	const id = Math.random().toString(36).substring(2, 6);
	if (games[id] == null) {
		return id;
	} else {
		return generateID();
	}
}

io.on("connection", (socket) => {
	if (debug) console.log("player connected...");
	let currentGame = null;

	socket.on("join-game", (id) => {
		if (games?.[id]?.inLobby) {
			games[id].players[socket.id] = {
				name: "",
				x: 0,
				y: 0,
				snowballs: [],
				anim: "idle",
				textureID: 0,
				killstreak: 0
			};

			currentGame = id;
			socket.emit("join.resolve", games[id]);
		} else {
			socket.emit("join.err", ERROR.GAME_NOT_FOUND);
			if (debug) console.log(`Game not found (${id})`);
		}
	});

	socket.on("host-game", (config, name) => {
		const id = generateID();

		currentGame = id;

		games[id] = {
			players: {
				[socket.id]: {
					name,
					x: 0,
					y: 0,
					snowballs: [],
					killstreak: 0
				}
			},
			inLobby: true,
			mode: gamemode.TOTEM_STEAL,
			teams: gamemode.FREE_FOR_ALL
		};

		socket.emit("game-created", id);
		console.log("! ", id, " !");
	});

	socket.on("packet.client", (data) => {
		if (currentGame && games[currentGame]?.players?.[socket.id]) {
			games[currentGame].players[socket.id] = {
				...games[currentGame].players[socket.id],
				...data
			};
			socket.emit("packet.server", games[currentGame]);
		}
	});

	socket.on("hit-player", (id) => {
		if (
			currentGame &&
			Object.keys(games[currentGame]?.players).indexOf(id) !== -1
		) {
			const dead = io.sockets.sockets.get(id);
			dead.emit("die");
			games[currentGame].players[socket.id].killstreak++;
			games[currentGame].players[id].killstreak = 0;
			console.log(games[currentGame].players[socket.id].killstreak);

			if (games[currentGame].players[socket.id].killstreak >= 5) {
				io.emit("player-win", { gameID: currentGame, playerID: socket.id });
				console.log("bruh");
			}
		}
	});

	socket.on("disconnect", () => {
		if (debug) console.log("player disconnect...");
		if (currentGame) {
			delete games[currentGame].players[socket.id];
			if (Object.keys(games?.[currentGame]?.players ?? {}).length === 0) {
				delete games[currentGame];
				if (debug) console.log("CLEAN UP!", games);
			}
		}
	});

	socket.on("set-name", (name) => {
		if (currentGame) {
			games[currentGame].players[socket.id].name = name;
			console.log(name);
		}
	});
});

app.get("/", (req, res) => {
	res.send(
		`<p># SuperSnowballShooterServer ###<br> Version ${
			process.env.VERSION
		}, running NodeJS ${process.version}.<br> ${
			!debug
				? "Go to https://mageowls.com/super-snow-shooter to play."
				: "<strong>! WARNING !</strong> Debug mode is enabled. The server can currently be accessed from localhost. Please contact owen@mageowls.com if you are seeing this."
		}</p>`
	);
});

httpServer.listen(PORT, () => {
	console.log("go");
});
