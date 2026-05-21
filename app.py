from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import requests
import base64
import json
import re
from datetime import datetime, timedelta

app = Flask(__name__)
app.secret_key = "secret_key_destempus"

BASE_URL = "https://proyectostic.ugr.es"


# ─── Helpers: autenticación ───────────────────────────────────────────────────

def get_auth_header(token):
    if not token:
        return None
    auth_str = f"apikey:{token}"
    b64_auth = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
    return {
        "Authorization": f"Basic {b64_auth}",
        "Accept": "application/hal+json"
    }


def api_get(path, params=None):
    token = session.get("op_token")
    if not token:
        return None
    try:
        r = requests.get(
            f"{BASE_URL}{path}",
            headers=get_auth_header(token),
            params=params,
            timeout=15
        )
        r.raise_for_status()
        return r.json()
    except requests.exceptions.RequestException:
        return None


def api_patch(path, data):
    token = session.get("op_token")
    if not token:
        return None, 401
    try:
        headers = {**get_auth_header(token), "Content-Type": "application/hal+json"}
        r = requests.patch(
            f"{BASE_URL}{path}",
            headers=headers,
            json=data,
            timeout=15
        )
        return r.json(), r.status_code
    except requests.exceptions.RequestException:
        return None, 0


def api_delete(path):
    token = session.get("op_token")
    if not token:
        return 401
    try:
        r = requests.delete(
            f"{BASE_URL}{path}",
            headers=get_auth_header(token),
            timeout=15
        )
        return r.status_code
    except requests.exceptions.RequestException:
        return 0


def parse_horas(valor):
    """Convierte horas de la API (ISO 8601 'PT2H30M' o float) a float."""
    try:
        return float(valor)
    except (TypeError, ValueError):
        pass
    match = re.match(r'PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?', str(valor))
    if match:
        return float(match.group(1) or 0) + float(match.group(2) or 0) / 60
    return 0.0


# ─── Rutas ────────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "GET" and session.get("op_token"):
        return redirect(url_for("registros"))

    error = None

    if request.method == "POST":
        token = request.form.get("token", "").strip()
        if not token:
            error = "Por favor, introduce un token de API válido."
        else:
            try:
                r = requests.get(
                    f"{BASE_URL}/api/v3/users/me",
                    headers=get_auth_header(token),
                    timeout=10
                )
                r.raise_for_status()
                session["op_token"] = token
                session["op_user"] = r.json().get("name", "Usuario")
                return redirect(url_for("registros"))
            except requests.exceptions.RequestException as e:
                error = f"Error al conectar con OpenProject: {str(e)}"

    return render_template("index.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/registros")
def registros():
    if not session.get("op_token"):
        return redirect(url_for("index"))

    hoy = datetime.today()
    fecha_inicio = (hoy - timedelta(days=5)).strftime("%Y-%m-%d")
    fecha_fin    = (hoy + timedelta(days=5)).strftime("%Y-%m-%d")

    return render_template("registros.html",
                           fecha_inicio=fecha_inicio,
                           fecha_fin=fecha_fin,
                           usuario=session.get("op_user", ""))


# ─── API AJAX ─────────────────────────────────────────────────────────────────

@app.route("/api/usuarios")
def api_usuarios():
    if not session.get("op_token"):
        return jsonify({"error": "No autenticado"}), 401

    usuarios = []
    offset   = 1
    while True:
        data = api_get("/api/v3/users", params={"pageSize": 100, "offset": offset})
        if not data:
            break
        page = data.get("_embedded", {}).get("elements", [])
        if not page:
            break
        for u in page:
            usuarios.append({
                "id":    u["id"],
                "name":  u.get("name", ""),
                "login": u.get("login", ""),
                "email": u.get("email", "")
            })
        if len(usuarios) >= data.get("total", 0):
            break
        offset += 100

    return jsonify({"usuarios": usuarios})


@app.route("/api/registros")
def api_registros():
    if not session.get("op_token"):
        return jsonify({"error": "No autenticado"}), 401

    usuario_ids  = request.args.getlist("usuarios")
    fecha_inicio = request.args.get("fecha_inicio")
    fecha_fin    = request.args.get("fecha_fin")

    if not usuario_ids or not fecha_inicio or not fecha_fin:
        return jsonify({"error": "Parámetros incompletos"}), 400

    filtros = json.dumps([
        {"user":     {"operator": "=",   "values": usuario_ids}},
        {"spent_on": {"operator": "<>d", "values": [fecha_inicio, fecha_fin]}}
    ])

    entries = []
    offset  = 1
    while True:
        data = api_get("/api/v3/time_entries", params={
            "filters":  filtros,
            "pageSize": 100,
            "offset":   offset,
            "sortBy":   '[["spent_on","desc"]]'
        })
        if not data:
            break
        page = data.get("_embedded", {}).get("elements", [])
        if not page:
            break

        for entry in page:
            horas = parse_horas(entry.get("hours", "PT0H"))
            comment_raw = entry.get("comment", "")
            if isinstance(comment_raw, dict):
                comment_raw = comment_raw.get("raw", "")

            entries.append({
                "id":           entry["id"],
                "lockVersion":  entry.get("lockVersion", 0),
                "fecha":        entry.get("spentOn") or entry.get("spent_on", ""),
                "horas":        round(horas, 2),
                "usuario":      entry.get("_links", {}).get("user", {}).get("title", ""),
                "usuario_id":   entry.get("_links", {}).get("user", {}).get("href", "").split("/")[-1],
                "proyecto":     entry.get("_links", {}).get("project", {}).get("title", ""),
                "actividad":    entry.get("_links", {}).get("activity", {}).get("title", ""),
                "actividad_id": entry.get("_links", {}).get("activity", {}).get("href", "").split("/")[-1],
                "paquete":      entry.get("_links", {}).get("workPackage", {}).get("title", "") or "",
                "comentario":   comment_raw,
            })

        if len(entries) >= data.get("total", 0):
            break
        offset += 100

    return jsonify({"registros": entries})


@app.route("/api/registro/<int:entry_id>", methods=["PATCH"])
def modificar_registro(entry_id):
    if not session.get("op_token"):
        return jsonify({"error": "No autenticado"}), 401

    body = request.get_json()
    if not body:
        return jsonify({"error": "Datos inválidos"}), 400

    patch_data = {}

    if "lockVersion" in body:
        patch_data["lockVersion"] = body["lockVersion"]

    if "horas" in body:
        try:
            h        = float(body["horas"])
            h_int    = int(h)
            mins     = round((h - h_int) * 60)
            patch_data["hours"] = f"PT{h_int}H{mins}M" if mins else f"PT{h_int}H"
        except (ValueError, TypeError):
            return jsonify({"error": "Valor de horas inválido"}), 400

    if "fecha" in body:
        patch_data["spentOn"] = body["fecha"]

    if "comentario" in body:
        patch_data["comment"] = {"raw": body["comentario"]}

    if not patch_data:
        return jsonify({"error": "Sin cambios que guardar"}), 400

    result, status = api_patch(f"/api/v3/time_entries/{entry_id}", patch_data)

    if status == 200:
        return jsonify({"ok": True})
    return jsonify({"error": f"Error de API (HTTP {status})", "detalle": result}), status or 500


@app.route("/api/registro/<int:entry_id>", methods=["DELETE"])
def borrar_registro(entry_id):
    if not session.get("op_token"):
        return jsonify({"error": "No autenticado"}), 401

    status = api_delete(f"/api/v3/time_entries/{entry_id}")

    if status in (200, 204):
        return jsonify({"ok": True})
    return jsonify({"error": f"Error de API (HTTP {status})"}), status or 500


if __name__ == "__main__":
    app.run(debug=True)
