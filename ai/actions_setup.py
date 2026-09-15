"""Setup completo del deploy en GitHub Actions. Correr UNA VEZ.

Hace:
  1. Crea repo privado mfaccs-private (si no existe)
  2. Sube mf_accounts.json (semilla de cuentas) a ese repo
  3. Sube discord_skinbot.py y .github/workflows/skinbot.yml a mfaccs
  4. Crea los 5 secrets en mfaccs (token bot, gh token, admins, canal, acc repo)
"""
import base64
import json
import os
import sys
import urllib.request

GH_TOKEN = os.environ["MFSB_GH_TOKEN"]
BOT_TOKEN = os.environ["MFSB_TOKEN"]
ADMINS = os.environ["MFSB_ADMINS"]
CHANNEL = os.environ.get("MFSB_CHANNEL", "")

OWNER = "EstebanGrp"
PUB = f"{OWNER}/mfaccs"
PRIV = f"{OWNER}/mfaccounts-priv"

HDRS = {
    "Authorization": f"Bearer {GH_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "mf-setup",
}


def api(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HDRS, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def put_file(repo, path, content, msg):
    st, j = api("GET", f"https://api.github.com/repos/{repo}/contents/{path}")
    sha = j.get("sha") if st == 200 else None
    st, j = api("PUT", f"https://api.github.com/repos/{repo}/contents/{path}", {
        "message": msg,
        "content": base64.b64encode(content.encode()).decode(),
        "branch": "main",
        **({"sha": sha} if sha else {}),
    })
    print(f"  put {repo}/{path}: {st}")
    return st in (200, 201)


# 1. repo privado
print("[1/4] repo privado mfaccounts-priv")
st, j = api("POST", "https://api.github.com/user/repos", {
    "name": "mfaccounts-priv", "private": True,
    "description": "MiniFeather accounts DB (hashes, bot-only)",
})
if st == 403:
    st2, j2 = api("GET", f"https://api.github.com/repos/{PRIV}")
    if st2 == 200:
        print("  ya existe (sin permiso de crear, ok)")
    else:
        sys.exit(f"repo no accesible: {st2} {j2.get('message')}")
elif st not in (201, 422):
    sys.exit(f"no pude crear el repo: {j}")
else:
    print(f"  create: {st}")

# 2. semilla de cuentas al privado
print("[2/4] mf_accounts.json -> privado")
acc_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mf_accounts.json")
seed = open(acc_path, encoding="utf-8").read() if os.path.exists(acc_path) else '{"cuentas": {}}\n'
if not put_file(PRIV, "mf_accounts.json", seed, "seed: cuentas locales"):
    sys.exit("fallo subida de mf_accounts.json")

# 3. bot + workflow al repo publico
print("[3/4] bot + workflow -> mfaccs (publico)")
base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # raiz del proyecto
bot_src = os.path.join(base, "mfbot_local", "discord_skinbot.py")
bot_alt = os.path.join(os.environ["USERPROFILE"], "Desktop", "mfbot", "discord_skinbot.py")
wf_src = os.path.join(base, ".github", "workflows", "skinbot.yml")
bot_py = open(bot_alt, encoding="utf-8").read() if os.path.exists(bot_alt) else open(bot_src, encoding="utf-8").read()
wf_yml = open(wf_src, encoding="utf-8").read()
# el workflow corre "python ai/discord_skinbot.py" → subimos a esa ruta
if not put_file(PUB, "ai/discord_skinbot.py", bot_py, "skinbot: bot"):
    sys.exit("fallo subida del bot")
put_file(PUB, ".github/workflows/skinbot.yml", wf_yml, "skinbot: workflow")

# 4. secrets en el publico (saltar con SKIP_SECRETS=1 si el token
#    aun no tiene permiso Secrets:write -> se crean a mano en la web)
if os.environ.get("SKIP_SECRETS"):
    print("[4/4] secrets -> SKIPPED (SKIP_SECRETS). Crear a mano, ver tabla.")
    print()
    print("Secrets a crear en la web (mfaccs -> Settings -> Secrets -> Actions):")
    print(f"  MFSB_TOKEN     = <token del bot>")
    print(f"  MFSB_GH_TOKEN  = token github (Contents:write en ambos repos)")
    print(f"  MFSB_ADMINS    = {ADMINS}")
    print(f"  MFSB_CHANNEL   = {CHANNEL}")
    print(f"  MFSB_ACC_REPO  = {PRIV}")
else:
    print("[4/4] secrets -> mfaccs")
    st, j = api("GET", f"https://api.github.com/repos/{PUB}")
    pub_id = j.get("id")
    if not pub_id:
        sys.exit(f"no pude leer id de {PUB}: {j}")

    # los secrets requieren encriptado libsodium; via API REST clasica:
    # PUT /repos/{owner}/{repo}/actions/secrets/{name} con encrypted_value
    # (NaCl sealed box contra el public key del repo). Implementacion minima:
    try:
        from nacl import encoding, public
    except ImportError:
        os.system(f"{sys.executable} -m pip install pynacl -q")
        from nacl import encoding, public

    st, j = api("GET", f"https://api.github.com/repos/{PUB}/actions/secrets/public-key")
    if st != 200:
        sys.exit(f"no pude obtener public-key: {st} {j}")
    pk = public.PublicKey(j["key"].encode(), encoding.Base64Encoder())
    sealed = public.SealedBox(pk)

    def put_secret(name, value):
        enc = sealed.encrypt(value.encode())
        st, _ = api(
            "PUT",
            f"https://api.github.com/repos/{PUB}/actions/secrets/{name}",
            {"encrypted_value": base64.b64encode(enc).decode(), "key_id": j["key_id"]},
        )
        print(f"  secret {name}: {st}")
        return st == 201 or st == 204

    for name, val in [
        ("MFSB_TOKEN", BOT_TOKEN),
        ("MFSB_GH_TOKEN", GH_TOKEN),
        ("MFSB_ADMINS", ADMINS),
        ("MFSB_CHANNEL", CHANNEL),
        ("MFSB_ACC_REPO", PRIV),
    ]:
        if val and not put_secret(name, val):
            sys.exit(f"fallo secret {name}")

print()
print("LISTO. Ahora:")
print("  1. apaga el bot local (yo lo hago)")
print("  2. github.com/EstebanGrp/mfaccs -> Actions -> skinbot -> Run workflow")
print("  3. para actualizar el bot en el futuro: sube el .py nuevo a mfaccs/ai/")
