const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test(
    "companion requires a session key and confines assets to content",
    { timeout: 10000 },
    async (t) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-test-"));
        const content = path.join(dir, "content");
        fs.mkdirSync(content);
        fs.writeFileSync(
            path.join(content, "screen.html"),
            "<h2>Test screen</h2>",
        );
        fs.writeFileSync(path.join(dir, "private.txt"), "outside content");
        fs.symlinkSync(
            path.join(dir, "private.txt"),
            path.join(content, "escape.txt"),
        );
        const server = spawn(
            process.execPath,
            [
                path.join(
                    root,
                    "skills/brainstorming-handoff/scripts/server.cjs",
                ),
            ],
            {
                env: {
                    ...process.env,
                    BRAINSTORM_DIR: dir,
                    BRAINSTORM_PORT: "",
                    BRAINSTORM_HOST: "127.0.0.1",
                    BRAINSTORM_URL_HOST: "127.0.0.1",
                    BRAINSTORM_TOKEN: "local-regression-test-key",
                    BRAINSTORM_TOKEN_FILE: "",
                    BRAINSTORM_PORT_FILE: "",
                    BRAINSTORM_OWNER_PID: "",
                    BRAINSTORM_OPEN: "",
                },
            },
        );
        t.after(async () => {
            if (server.exitCode === null && server.signalCode === null) {
                const exited = once(server, "exit");
                server.kill();
                await exited;
            }
            fs.rmSync(dir, { recursive: true, force: true });
        });
        let stderr = "";
        server.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        const lines = readline.createInterface({ input: server.stdout });
        const info = await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.once("exit", (code) =>
                reject(new Error(`Server exited ${code}: ${stderr}`)),
            );
            lines.on("line", (line) => {
                const message = JSON.parse(line);
                if (message.type === "server-started") resolve(message);
            });
        });
        const url = new URL(info.url);
        assert.equal(url.searchParams.get("key"), "local-regression-test-key");
        assert.equal((await fetch(url.origin)).status, 403);
        assert.equal((await fetch(`${url.origin}/?key=wrong`)).status, 403);
        assert.equal(
            (await fetch(`${url.origin}/files/screen.html`)).status,
            403,
        );
        const bootstrap = await fetch(url);
        assert.equal(bootstrap.status, 200);
        const cookie = bootstrap.headers.get("set-cookie").split(";")[0];
        const options = { headers: { Cookie: cookie } };
        const screen = await fetch(url.origin, options);
        const html = await screen.text();
        assert.match(html, /Test screen/);
        assert.match(html, /Brainstorming Handoff/);
        assert.doesNotMatch(html, /primeradiant\.com/);
        assert.equal(screen.headers.get("referrer-policy"), "no-referrer");
        assert.equal(
            (await fetch(`${url.origin}/files/screen.html`, options)).status,
            200,
        );
        assert.equal(
            (await fetch(`${url.origin}/files/escape.txt`, options)).status,
            404,
        );
        assert.equal(
            (await fetch(`${url.origin}/files/`, options)).status,
            404,
        );

        const wsUrl = new URL(url);
        wsUrl.protocol = "ws:";
        const deniedUrl = new URL(wsUrl);
        deniedUrl.search = "";
        const denied = new WebSocket(deniedUrl);
        await once(denied, "error");
        const socket = new WebSocket(wsUrl);
        await once(socket, "open");
        const recorded = new Promise((resolve) => {
            lines.on("line", (line) => {
                if (JSON.parse(line).choice === "accepted") resolve();
            });
        });
        socket.send(JSON.stringify({ type: "click", choice: "accepted" }));
        await recorded;
        const closed = once(socket, "close");
        socket.close();
        await closed;
        assert.equal(
            JSON.parse(fs.readFileSync(path.join(dir, "state/events"), "utf8"))
                .choice,
            "accepted",
        );
    },
);

test("wizard preserves literal values, file permissions and symlinks; rejects EOF", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wizard-test-"));
    try {
        const template = fs.readFileSync(
            path.join(
                root,
                "plugins/mattpocock-skills-arc-version/skills/wizard/template.sh",
            ),
            "utf8",
        );
        const library = template.slice(0, template.indexOf("run_wizard() {"));
        const result = spawnSync(
            "bash",
            [
                "-c",
                library +
                    `
write_env SAMPLE "$TEST_LITERAL"
[[ "$SAMPLE" == "$TEST_LITERAL" ]]
[[ "$(_existing SAMPLE)" == "$TEST_LITERAL" ]]
source "$ENV_FILE"
[[ "$SAMPLE" == "$TEST_LITERAL" ]]
mv "$ENV_FILE" "$ENV_FILE.target"
ln -s "$ENV_FILE.target" "$ENV_FILE"
write_env SAMPLE 'updated value'
[[ -L "$ENV_FILE" ]]
[[ "$(_existing SAMPLE)" == 'updated value' ]]
if ask SAMPLE 'Value' < /dev/null; then exit 1; fi
if ask_secret SAMPLE 'Secret' < /dev/null; then exit 1; fi
`,
            ],
            {
                cwd: dir,
                env: {
                    ...process.env,
                    ENV_FILE: path.join(dir, ".env"),
                    TEST_LITERAL:
                        "literal 'quote' $HOME $(touch MUST_NOT_EXIST) `touch ALSO_MUST_NOT_EXIST` # text",
                },
                encoding: "utf8",
            },
        );
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.equal(
            fs.statSync(path.join(dir, ".env.target")).mode & 0o777,
            0o600,
        );
        assert.equal(fs.existsSync(path.join(dir, "MUST_NOT_EXIST")), false);
        assert.equal(
            fs.existsSync(path.join(dir, "ALSO_MUST_NOT_EXIST")),
            false,
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
