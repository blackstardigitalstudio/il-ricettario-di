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


def test_new_recipe_features():
    """Tests for the new editor + tags/difficulty/times/favorites feature set."""
    # A) POST /api/recipes with defaults
    payload = {
        "name": "Pasta al Pomodoro",
        "source_url": "https://www.instagram.com/reel/TESTVAL/",
        "manual_caption": "Pomodoro fresco, basilico, aglio.",
    }
    r = requests.post(f"{BASE}/recipes", json=payload)
    body = safe_json(r)
    has_defaults = (
        isinstance(body, dict)
        and body.get("tags") == []
        and body.get("difficulty") == ""
        and body.get("prep_time") == 0
        and body.get("cook_time") == 0
        and body.get("is_favorite") is False
    )
    ok = r.status_code == 200 and has_defaults
    record("A) POST /api/recipes has new fields with defaults", ok,
           f"status={r.status_code} tags={body.get('tags') if isinstance(body, dict) else None} "
           f"difficulty={body.get('difficulty') if isinstance(body, dict) else None} "
           f"prep_time={body.get('prep_time') if isinstance(body, dict) else None} "
           f"cook_time={body.get('cook_time') if isinstance(body, dict) else None} "
           f"is_favorite={body.get('is_favorite') if isinstance(body, dict) else None}")
    if not ok:
        return
    recipe_id = body["id"]
    # initial transcription should be empty and status 'none'
    ok_init_trans = body.get("transcription", "") == "" and body.get("transcription_status") == "none"
    record("A) initial transcription empty & status='none'", ok_init_trans,
           f"transcription={body.get('transcription')!r} status={body.get('transcription_status')!r}")

    # B) PUT all new fields + transcription -> status auto done
    put_payload = {
        "tags": ["vegetariano", "veloce"],
        "difficulty": "medium",
        "prep_time": 15,
        "cook_time": 25,
        "is_favorite": True,
        "transcription": "Manual recipe text",
    }
    r = requests.put(f"{BASE}/recipes/{recipe_id}", json=put_payload)
    body = safe_json(r)
    ok = (
        r.status_code == 200
        and isinstance(body, dict)
        and body.get("tags") == ["vegetariano", "veloce"]
        and body.get("difficulty") == "medium"
        and body.get("prep_time") == 15
        and body.get("cook_time") == 25
        and body.get("is_favorite") is True
        and body.get("transcription") == "Manual recipe text"
        and body.get("transcription_status") == "done"
    )
    record("B) PUT new fields persist + transcription_status='done'", ok,
           f"status={r.status_code} body={ {k: body.get(k) for k in ['tags','difficulty','prep_time','cook_time','is_favorite','transcription','transcription_status']} if isinstance(body, dict) else body}")

    # C) GET /api/recipes?favorites=true contains recipe
    r = requests.get(f"{BASE}/recipes", params={"favorites": "true"})
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, list) and any(x.get("id") == recipe_id for x in body)
    record("C) GET /api/recipes?favorites=true includes favored recipe", ok,
           f"status={r.status_code} count={len(body) if isinstance(body, list) else 'NA'}")
    # also unfiltered GET must include it
    r = requests.get(f"{BASE}/recipes")
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, list) and any(x.get("id") == recipe_id for x in body)
    record("C) GET /api/recipes (no filter) includes favored recipe", ok,
           f"status={r.status_code}")
    # also: every recipe returned under favorites=true has is_favorite True
    r = requests.get(f"{BASE}/recipes", params={"favorites": "true"})
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, list) and all(x.get("is_favorite") is True for x in body)
    record("C) all entries in favorites=true have is_favorite=true", ok,
           f"non_fav_count={sum(1 for x in (body or []) if not x.get('is_favorite'))}")

    # Toggle is_favorite=false
    r = requests.put(f"{BASE}/recipes/{recipe_id}", json={"is_favorite": False})
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, dict) and body.get("is_favorite") is False
    record("C) PUT is_favorite=false", ok, f"status={r.status_code}")

    r = requests.get(f"{BASE}/recipes", params={"favorites": "true"})
    body = safe_json(r)
    ok = r.status_code == 200 and isinstance(body, list) and not any(x.get("id") == recipe_id for x in body)
    record("C) favorites=true excludes after toggle", ok,
           f"status={r.status_code} count={len(body) if isinstance(body, list) else 'NA'}")

    # D) Partial update: only tags should change
    # First re-fetch current state
    r = requests.get(f"{BASE}/recipes/{recipe_id}")
    before = safe_json(r) or {}
    r = requests.put(f"{BASE}/recipes/{recipe_id}", json={"tags": ["dolce"]})
    after = safe_json(r) or {}
    ok = (
        r.status_code == 200
        and after.get("tags") == ["dolce"]
        and after.get("difficulty") == before.get("difficulty")
        and after.get("prep_time") == before.get("prep_time")
        and after.get("cook_time") == before.get("cook_time")
        and after.get("is_favorite") == before.get("is_favorite")
        and after.get("transcription") == before.get("transcription")
        and after.get("transcription_status") == before.get("transcription_status")
    )
    record("D) Partial PUT (only tags) leaves other fields unchanged", ok,
           f"before={ {k: before.get(k) for k in ['tags','difficulty','prep_time','cook_time','is_favorite']} } "
           f"after={ {k: after.get(k) for k in ['tags','difficulty','prep_time','cook_time','is_favorite']} }")

    # E) DELETE
    r = requests.delete(f"{BASE}/recipes/{recipe_id}")
    body = safe_json(r)
    ok = r.status_code == 200 and body and body.get("message") == "Ricetta eliminata"
    record("E) DELETE test recipe", ok, f"status={r.status_code} body={body}")
    r = requests.get(f"{BASE}/recipes/{recipe_id}")
    ok = r.status_code == 404
    record("E) GET deleted recipe -> 404", ok, f"status={r.status_code}")


def test_transcription_empty_does_not_flip_status():
    """Edge case: empty/whitespace-only transcription should NOT flip status to 'done'."""
    r = requests.post(f"{BASE}/recipes", json={
        "name": "Test Empty Transcription",
        "source_url": "https://www.instagram.com/reel/EMPTYTRANS/",
        "manual_caption": "x",
    })
    if r.status_code != 200:
        record("Edge: create recipe for empty-transcription", False, f"status={r.status_code}")
        return
    rid = r.json()["id"]
    try:
        r = requests.put(f"{BASE}/recipes/{rid}", json={"transcription": "   "})
        body = safe_json(r) or {}
        ok = body.get("transcription_status") != "done"
        record("Edge: whitespace-only transcription keeps status != 'done'",
               ok, f"status_field={body.get('transcription_status')!r}")
    finally:
        requests.delete(f"{BASE}/recipes/{rid}")


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

        # NEW FEATURE TESTS (tags, difficulty, times, favorites, transcription auto-done)
        test_new_recipe_features()
        test_transcription_empty_does_not_flip_status()
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
