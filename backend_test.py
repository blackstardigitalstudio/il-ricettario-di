"""Regression test for the refactored Il Ricettario backend.

Tests all endpoints at http://localhost:8001/api after the monolithic
server.py was split into config/db/models/services/routes modules.
All endpoint paths & response shapes MUST remain identical.
"""
import sys
import requests

BASE = "http://localhost:8001/api"

results = []  # list of (name, ok, detail)


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name} {('- ' + detail) if detail else ''}")


def safe_json(r):
    try:
        return r.json()
    except Exception:
        return None


def test_welcome():
    r = requests.get(f"{BASE}/")
    ok = r.status_code == 200 and safe_json(r) == {"message": "Il Ricettario - API"}
    record("GET /api/ welcome", ok, f"status={r.status_code} body={r.text[:200]}")


def test_auth_me_logout():
    r = requests.get(f"{BASE}/auth/me")
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, dict) and body.get("user_id") == "local_user"
    record("GET /api/auth/me (DEFAULT_LOCAL_USER fallback)", ok, f"status={r.status_code} body={body}")

    r = requests.post(f"{BASE}/auth/logout")
    body = safe_json(r)
    ok = r.status_code == 200 and body == {"message": "Logout effettuato"}
    record("POST /api/auth/logout", ok, f"status={r.status_code} body={body}")


def test_instagram_session():
    r = requests.get(f"{BASE}/instagram/session")
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, dict) and body.get("connected") is False
    record("GET /api/instagram/session (not connected)", ok, f"status={r.status_code} body={body}")

    r = requests.delete(f"{BASE}/instagram/session")
    body = safe_json(r)
    ok = (
        r.status_code == 200
        and isinstance(body, dict)
        and body.get("success") is True
        and body.get("connected") is False
    )
    record("DELETE /api/instagram/session", ok, f"status={r.status_code} body={body}")


def test_extract_invalid():
    r = requests.post(f"{BASE}/extract", json={"url": "https://fake.invalid"})
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, dict) and body.get("success") is False and body.get("error")
    record("POST /api/extract (unsupported URL)", ok, f"status={r.status_code} body={body}")


def test_folders_crud():
    r = requests.post(f"{BASE}/folders", json={"name": "Dolci"})
    body = safe_json(r)
    ok = r.status_code == 200 and body and body.get("name") == "Dolci" and body.get("id")
    record("POST /api/folders", ok, f"status={r.status_code} body={body}")
    if not ok:
        return None
    folder_id = body["id"]

    r = requests.get(f"{BASE}/folders")
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, list) and any(f.get("id") == folder_id for f in body)
    record("GET /api/folders (list contains created)", ok,
           f"status={r.status_code} count={len(body) if isinstance(body, list) else 'NA'}")

    r = requests.get(f"{BASE}/folders/{folder_id}")
    body = safe_json(r)
    ok = r.status_code == 200 and body and body.get("id") == folder_id
    record("GET /api/folders/{id}", ok, f"status={r.status_code}")

    r = requests.get(f"{BASE}/folders/nonexistent-xyz")
    ok = r.status_code == 404
    record("GET /api/folders/{bad_id} -> 404", ok, f"status={r.status_code}")

    r = requests.put(f"{BASE}/folders/{folder_id}", json={"name": "Dolci Rinominati"})
    body = safe_json(r)
    ok = r.status_code == 200 and body and body.get("name") == "Dolci Rinominati"
    record("PUT /api/folders/{id}", ok, f"status={r.status_code}")

    return folder_id


def test_subfolders_crud(folder_id):
    r = requests.post(f"{BASE}/subfolders", json={"folder_id": folder_id, "name": "Torte"})
    body = safe_json(r)
    ok = r.status_code == 200 and body and body.get("name") == "Torte" and body.get("folder_id") == folder_id
    record("POST /api/subfolders", ok, f"status={r.status_code} body={body}")
    if not ok:
        return None
    sub_id = body["id"]

    r = requests.get(f"{BASE}/subfolders", params={"folder_id": folder_id})
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, list) and any(s.get("id") == sub_id for s in body)
    record("GET /api/subfolders?folder_id=", ok,
           f"status={r.status_code} count={len(body) if isinstance(body, list) else 'NA'}")

    r = requests.put(f"{BASE}/subfolders/{sub_id}", json={"name": "Torte Rinominate"})
    body = safe_json(r)
    ok = r.status_code == 200 and body and body.get("name") == "Torte Rinominate"
    record("PUT /api/subfolders/{id}", ok, f"status={r.status_code}")

    r = requests.put(f"{BASE}/subfolders/nonexistent-xyz", json={"name": "x"})
    ok = r.status_code == 404
    record("PUT /api/subfolders/{bad_id} -> 404", ok, f"status={r.status_code}")

    return sub_id


def test_recipes_crud(folder_id, sub_id):
    payload = {
        "name": "Tiramisu della Nonna",
        "source_url": "https://www.instagram.com/reel/ABCDEF/",
        "manual_caption": "Ricetta tradizionale del tiramisu",
        "folder_id": folder_id,
        "subfolder_id": sub_id,
        "notes": "Preparare il giorno prima",
    }
    r = requests.post(f"{BASE}/recipes", json=payload)
    body = safe_json(r)
    ok = (
        r.status_code == 200
        and body
        and body.get("name") == "Tiramisu della Nonna"
        and body.get("platform") == "instagram"
        and body.get("caption") == "Ricetta tradizionale del tiramisu"
        and body.get("folder_id") == folder_id
    )
    record("POST /api/recipes (instagram URL)", ok,
           f"status={r.status_code} body_keys={list(body.keys()) if isinstance(body, dict) else body}")
    if not ok:
        return None
    recipe_id = body["id"]

    r = requests.get(f"{BASE}/recipes")
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, list) and any(x.get("id") == recipe_id for x in body)
    record("GET /api/recipes", ok, f"status={r.status_code}")

    r = requests.get(f"{BASE}/recipes/count")
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, dict) and isinstance(body.get("count"), int) and body["count"] >= 1
    record("GET /api/recipes/count", ok, f"status={r.status_code} body={body}")

    r = requests.get(f"{BASE}/recipes/random", params={"count": 3})
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, list)
    record("GET /api/recipes/random?count=3", ok, f"status={r.status_code}")

    r = requests.get(f"{BASE}/recipes/{recipe_id}")
    body = safe_json(r)
    ok = r.status_code == 200 and body and body.get("id") == recipe_id
    record("GET /api/recipes/{id}", ok, f"status={r.status_code}")

    r = requests.get(f"{BASE}/recipes/nonexistent-xyz")
    ok = r.status_code == 404
    record("GET /api/recipes/{bad_id} -> 404", ok, f"status={r.status_code}")

    r = requests.put(f"{BASE}/recipes/{recipe_id}", json={"name": "Tiramisu Rivisitato", "notes": "Aggiornato"})
    body = safe_json(r)
    ok = r.status_code == 200 and body and body.get("name") == "Tiramisu Rivisitato" and body.get("notes") == "Aggiornato"
    record("PUT /api/recipes/{id}", ok, f"status={r.status_code}")

    r = requests.delete(f"{BASE}/recipes/{recipe_id}")
    body = safe_json(r)
    ok = r.status_code == 200 and body and body.get("message") == "Ricetta eliminata"
    record("DELETE /api/recipes/{id}", ok, f"status={r.status_code} body={body}")

    r = requests.get(f"{BASE}/recipes/{recipe_id}")
    ok = r.status_code == 404
    record("GET deleted recipe -> 404", ok, f"status={r.status_code}")


def test_invalid_url_on_recipe():
    r = requests.post(f"{BASE}/recipes", json={"name": "x", "source_url": "https://fake.invalid"})
    ok = r.status_code == 400
    record("POST /api/recipes (unsupported URL -> 400)", ok, f"status={r.status_code} body={r.text[:200]}")


def test_delete_folder_cascade():
    r = requests.post(f"{BASE}/folders", json={"name": "CartellaCascata"})
    if r.status_code != 200:
        record("Cascade setup: create folder", False, f"status={r.status_code}")
        return
    folder_id = r.json()["id"]

    r = requests.post(f"{BASE}/subfolders", json={"folder_id": folder_id, "name": "SubCascata"})
    sub_id = r.json()["id"] if r.status_code == 200 else None

    r = requests.post(f"{BASE}/recipes", json={
        "name": "Pasta alla Carbonara",
        "source_url": "https://www.instagram.com/reel/CASCADE/",
        "manual_caption": "Carbonara autentica",
        "folder_id": folder_id,
        "subfolder_id": sub_id,
    })
    if r.status_code != 200:
        record("Cascade setup: create recipe", False, f"status={r.status_code}")
        return
    recipe_id = r.json()["id"]

    r = requests.delete(f"{BASE}/folders/{folder_id}")
    ok = r.status_code == 200
    record("DELETE /api/folders/{id}", ok, f"status={r.status_code}")

    r = requests.get(f"{BASE}/folders/{folder_id}")
    ok = r.status_code == 404
    record("Folder gone after delete -> 404", ok, f"status={r.status_code}")

    r = requests.get(f"{BASE}/subfolders", params={"folder_id": folder_id})
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, list) and not any(s.get("id") == sub_id for s in body)
    record("Cascade: subfolder deleted with folder", ok, f"leftover_count={len(body) if isinstance(body, list) else 'NA'}")

    r = requests.get(f"{BASE}/recipes/{recipe_id}")
    ok = r.status_code == 404
    record("Cascade: recipe deleted with folder", ok, f"status={r.status_code}")


def cleanup(folder_id, sub_id):
    if sub_id:
        requests.delete(f"{BASE}/subfolders/{sub_id}")
    if folder_id:
        requests.delete(f"{BASE}/folders/{folder_id}")


def main():
    print(f"\n=== Backend Regression Tests against {BASE} ===\n")
    folder_id = None
    sub_id = None
    try:
        test_welcome()
        test_auth_me_logout()
        test_instagram_session()
        test_extract_invalid()
        test_invalid_url_on_recipe()

        folder_id = test_folders_crud()
        sub_id = test_subfolders_crud(folder_id) if folder_id else None
        if folder_id:
            test_recipes_crud(folder_id, sub_id)

        test_delete_folder_cascade()
    except Exception as e:
        record("UNEXPECTED EXCEPTION", False, repr(e))
    finally:
        cleanup(folder_id, sub_id)

    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n=== Summary: {passed}/{total} passed ===\n")
    for name, ok, detail in results:
        if not ok:
            print(f"  FAIL: {name} -- {detail}")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
