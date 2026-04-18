"""Regression test for auth cleanup (2026-04-18).

Removed endpoints: POST /api/auth/session, POST /api/auth/logout
Kept: GET /api/, GET /api/auth/me (device fallback), PUT /api/auth/profile
Plus quick regression of Folders/Subfolders/Recipes/Search/Shopping/Backup/Instagram
"""
import sys
import uuid
import requests

BASE = "http://localhost:8001/api"
DEVICE_ID = "test-device-abc123xyz456"
DEVICE_HEADER = {"X-Device-Id": DEVICE_ID}

results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name} {('- ' + detail) if detail else ''}")


def safe_json(r):
    try:
        return r.json()
    except Exception:
        return None


# ---------------- Auth cleanup ----------------
def test_removed_session():
    r = requests.post(f"{BASE}/auth/session", json={"session_id": "x"})
    record("POST /api/auth/session -> 404", r.status_code == 404,
           f"status={r.status_code} body={r.text[:120]}")


def test_removed_logout():
    r = requests.post(f"{BASE}/auth/logout")
    record("POST /api/auth/logout -> 404", r.status_code == 404,
           f"status={r.status_code} body={r.text[:120]}")


def test_root():
    r = requests.get(f"{BASE}/")
    body = safe_json(r)
    record("GET /api/ -> welcome", r.status_code == 200 and body == {"message": "Il Ricettario - API"},
           f"status={r.status_code} body={body}")


def test_me_device():
    r = requests.get(f"{BASE}/auth/me", headers=DEVICE_HEADER)
    body = safe_json(r) or {}
    ok = (
        r.status_code == 200
        and body.get("user_id") == f"device_{DEVICE_ID}"
        and body.get("is_anonymous") is True
    )
    record("GET /api/auth/me (device id)", ok, f"status={r.status_code} body={body}")


def test_me_fallback():
    r = requests.get(f"{BASE}/auth/me")
    body = safe_json(r) or {}
    ok = r.status_code == 200 and body.get("user_id") == "local_user"
    record("GET /api/auth/me (DEFAULT_LOCAL_USER fallback)", ok,
           f"status={r.status_code} body={body}")


def test_profile_put():
    r = requests.put(f"{BASE}/auth/profile", json={"name": "Nuovo Nome"}, headers=DEVICE_HEADER)
    body = safe_json(r)
    # NOTE: device users are NOT persisted to db.users, so update_one matches nothing
    # and find_one returns None. Spec says "user doc updated" which implies the
    # endpoint should persist + return the user. This is a functional issue.
    ok = r.status_code == 200 and isinstance(body, dict) and body.get("name") == "Nuovo Nome"
    record("PUT /api/auth/profile -> 200 with updated user", ok,
           f"status={r.status_code} body={body}")


# ---------------- Regression ----------------
def test_folders_subfolders_recipes_cascade():
    # Create folder
    r = requests.post(f"{BASE}/folders", json={"name": "Dolci Test"}, headers=DEVICE_HEADER)
    folder = safe_json(r) or {}
    folder_id = folder.get("id")
    record("POST /api/folders", r.status_code == 200 and bool(folder_id), f"status={r.status_code}")

    # List
    r = requests.get(f"{BASE}/folders", headers=DEVICE_HEADER)
    lst = safe_json(r) or []
    record("GET /api/folders contains new", any(f["id"] == folder_id for f in lst),
           f"count={len(lst)}")

    # Update
    r = requests.put(f"{BASE}/folders/{folder_id}", json={"name": "Dolci Rinominati"},
                     headers=DEVICE_HEADER)
    record("PUT /api/folders/{id}", r.status_code == 200, f"status={r.status_code}")

    # Unknown id -> 404
    r = requests.get(f"{BASE}/folders/{uuid.uuid4().hex}", headers=DEVICE_HEADER)
    record("GET /api/folders/{unknown} -> 404", r.status_code == 404, f"status={r.status_code}")

    # Subfolder
    r = requests.post(f"{BASE}/subfolders",
                      json={"name": "Torte Test", "folder_id": folder_id},
                      headers=DEVICE_HEADER)
    sub = safe_json(r) or {}
    sub_id = sub.get("id")
    record("POST /api/subfolders", r.status_code == 200 and bool(sub_id), f"status={r.status_code}")

    r = requests.get(f"{BASE}/subfolders?folder_id={folder_id}", headers=DEVICE_HEADER)
    lst = safe_json(r) or []
    record("GET /api/subfolders?folder_id filter",
           any(s["id"] == sub_id for s in lst), f"count={len(lst)}")

    # Recipe
    r = requests.post(f"{BASE}/recipes",
                      json={"name": "Tiramisù Test", "folder_id": folder_id,
                            "source_url": "https://www.instagram.com/reel/REGR1ABCDEF/",
                            "manual_caption": "Tiramisù di prova"},
                      headers=DEVICE_HEADER)
    rec = safe_json(r) or {}
    rec_id = rec.get("id")
    rec_ok = (
        r.status_code == 200 and bool(rec_id)
        and rec.get("tags") == [] and rec.get("difficulty") == ""
        and rec.get("is_favorite") is False
    )
    record("POST /api/recipes with defaults", rec_ok, f"status={r.status_code} body keys={list(rec.keys())[:10]}")

    # PUT recipe with new fields + ingredients
    update_body = {
        "tags": ["italiano", "dolce-casa"],
        "difficulty": "medio",
        "prep_time": 20,
        "cook_time": 0,
        "is_favorite": True,
        "ingredients": "- 4 uova\n- 500g mascarpone\n- 100g zucchero\n- caffè",
    }
    r = requests.put(f"{BASE}/recipes/{rec_id}", json=update_body, headers=DEVICE_HEADER)
    rec = safe_json(r) or {}
    ok = (
        r.status_code == 200
        and rec.get("tags") == ["italiano", "dolce-casa"]
        and rec.get("difficulty") == "medio"
        and rec.get("prep_time") == 20
        and rec.get("is_favorite") is True
    )
    record("PUT /api/recipes/{id} persists new fields", ok, f"status={r.status_code}")

    # Create second recipe for search + shopping
    r = requests.post(f"{BASE}/recipes",
                      json={"name": "Pasta al Pomodoro", "folder_id": folder_id,
                            "source_url": "https://www.instagram.com/reel/REGR2ABCDEF/",
                            "manual_caption": "Pasta al pomodoro"},
                      headers=DEVICE_HEADER)
    rec2 = safe_json(r) or {}
    rec2_id = rec2.get("id")
    requests.put(f"{BASE}/recipes/{rec2_id}",
                 json={"ingredients": "- 200g spaghetti\n- 100g zucchero\n- pomodoro",
                       "tags": ["primi"]},
                 headers=DEVICE_HEADER)

    # Search tests
    r = requests.get(f"{BASE}/recipes?search=mascarpone", headers=DEVICE_HEADER)
    lst = safe_json(r) or []
    record("GET /api/recipes?search=<ingredient>",
           any(x["id"] == rec_id for x in lst), f"count={len(lst)}")

    r = requests.get(f"{BASE}/recipes?search=italiano", headers=DEVICE_HEADER)
    lst = safe_json(r) or []
    record("GET /api/recipes?search=<tag>",
           any(x["id"] == rec_id for x in lst), f"count={len(lst)}")

    r = requests.get(f"{BASE}/recipes?search=nonexistent_xyz_000", headers=DEVICE_HEADER)
    lst = safe_json(r) or []
    record("GET /api/recipes?search=<none>", lst == [], f"count={len(lst)}")

    r = requests.get(f"{BASE}/recipes?favorites=true", headers=DEVICE_HEADER)
    lst = safe_json(r) or []
    record("GET /api/recipes?favorites=true",
           all(x.get("is_favorite") for x in lst) and any(x["id"] == rec_id for x in lst),
           f"count={len(lst)}")

    # Shopping list generate
    r = requests.post(f"{BASE}/shopping-list/generate",
                      json={"recipe_ids": [rec_id, rec2_id], "language": "it"},
                      headers=DEVICE_HEADER)
    body = safe_json(r) or {}
    ok = (
        r.status_code == 200
        and isinstance(body.get("items"), list) and len(body["items"]) > 0
        and isinstance(body.get("raw"), str) and body["raw"]
        and len(body.get("recipe_names", [])) == 2
    )
    record("POST /api/shopping-list/generate",
           ok, f"status={r.status_code} items_len={len(body.get('items', []))}")

    # Error paths
    r = requests.post(f"{BASE}/shopping-list/generate",
                      json={"recipe_ids": [], "language": "it"}, headers=DEVICE_HEADER)
    record("POST /api/shopping-list/generate empty -> 400", r.status_code == 400,
           f"status={r.status_code}")

    r = requests.post(f"{BASE}/shopping-list/generate",
                      json={"recipe_ids": ["unknown-id-xyz"], "language": "it"},
                      headers=DEVICE_HEADER)
    record("POST /api/shopping-list/generate unknown id -> 404", r.status_code == 404,
           f"status={r.status_code}")

    # Backup export
    r = requests.get(f"{BASE}/backup/export", headers=DEVICE_HEADER)
    body = safe_json(r) or {}
    ok = (
        r.status_code == 200
        and body.get("app") == "Il Ricettario"
        and body.get("version") == 1
        and isinstance(body.get("folders"), list)
        and isinstance(body.get("subfolders"), list)
        and isinstance(body.get("recipes"), list)
        and body.get("totals", {}).get("folders") == len(body["folders"])
    )
    record("GET /api/backup/export", ok,
           f"status={r.status_code} totals={body.get('totals')}")

    # Keep reference for import test
    backup_payload = body

    # Backup import merge (same data -> all skipped)
    r = requests.post(f"{BASE}/backup/import",
                      json={"data": backup_payload, "mode": "merge"},
                      headers=DEVICE_HEADER)
    body = safe_json(r) or {}
    ok = (
        r.status_code == 200
        and body.get("success") is True
        and body.get("mode") == "merge"
        and body.get("imported", {}).get("folders") == 0
        and body.get("imported", {}).get("recipes") == 0
    )
    record("POST /api/backup/import merge (idempotent)", ok,
           f"status={r.status_code} body={body}")

    # Backup import replace
    r = requests.post(f"{BASE}/backup/import",
                      json={"data": backup_payload, "mode": "replace"},
                      headers=DEVICE_HEADER)
    body = safe_json(r) or {}
    imp = body.get("imported", {})
    ok = (
        r.status_code == 200
        and body.get("mode") == "replace"
        and imp.get("folders") == len(backup_payload["folders"])
        and imp.get("recipes") == len(backup_payload["recipes"])
    )
    record("POST /api/backup/import replace", ok,
           f"status={r.status_code} imported={imp}")

    # Instagram session GET & DELETE
    r = requests.get(f"{BASE}/instagram/session", headers=DEVICE_HEADER)
    body = safe_json(r) or {}
    record("GET /api/instagram/session",
           r.status_code == 200 and "connected" in body,
           f"status={r.status_code} body={body}")

    r = requests.delete(f"{BASE}/instagram/session", headers=DEVICE_HEADER)
    body = safe_json(r) or {}
    record("DELETE /api/instagram/session",
           r.status_code == 200 and body.get("connected") is False,
           f"status={r.status_code} body={body}")

    # Cleanup: delete folder (cascade)
    r = requests.delete(f"{BASE}/folders/{folder_id}", headers=DEVICE_HEADER)
    record("DELETE /api/folders/{id} (cascade)", r.status_code == 200,
           f"status={r.status_code}")

    # Verify recipes gone
    r = requests.get(f"{BASE}/recipes/{rec_id}", headers=DEVICE_HEADER)
    record("Recipe removed by cascade", r.status_code == 404, f"status={r.status_code}")


def main():
    test_removed_session()
    test_removed_logout()
    test_root()
    test_me_device()
    test_me_fallback()
    test_profile_put()
    test_folders_subfolders_recipes_cascade()

    passed = sum(1 for _, ok, _ in results if ok)
    failed = [n for n, ok, _ in results if not ok]
    print(f"\n=== {passed}/{len(results)} PASSED ===")
    if failed:
        print("Failures:")
        for n in failed:
            print(f"  - {n}")
        sys.exit(1)


if __name__ == "__main__":
    main()
