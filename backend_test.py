"""Backend regression test for `?light=true` query param on GET /api/recipes.

Tests new light projection feature + full regression per review request.
Runs against http://localhost:8001/api using X-Device-Id for user isolation.
"""
import json
import sys
import uuid

import requests

BASE = "http://localhost:8001/api"
DEVICE_ID = f"test-light-{uuid.uuid4().hex[:12]}"
DEVICE_ID_OTHER = f"test-light-other-{uuid.uuid4().hex[:12]}"
HEADERS = {"X-Device-Id": DEVICE_ID, "Content-Type": "application/json"}
HEADERS_OTHER = {"X-Device-Id": DEVICE_ID_OTHER, "Content-Type": "application/json"}

PASSED = []
FAILED = []


def check(name, cond, detail=""):
    if cond:
        PASSED.append(name)
        print(f"  OK {name}")
    else:
        FAILED.append((name, detail))
        print(f"  FAIL {name} -- {detail}")


def section(title):
    print(f"\n=== {title} ===")


def pretty(r):
    try:
        return json.dumps(r.json(), ensure_ascii=False)[:400]
    except Exception:
        return r.text[:400]


# --- 0. root health -----------------------------------------------------
section("0. Root health")
r = requests.get(f"{BASE}/", headers=HEADERS)
check("GET /api/ -> 200", r.status_code == 200, pretty(r))
check("GET /api/ message", r.json().get("message") == "Il Ricettario - API", pretty(r))


# --- 1. Create folder + recipe ----------------------------------------
section("1. Create folder + recipe")
r = requests.post(f"{BASE}/folders", headers=HEADERS, json={"name": "Dolci Light Test"})
check("POST /api/folders -> 200", r.status_code == 200, pretty(r))
folder = r.json()
folder_id = folder["id"]
check("Folder has UUID id", bool(folder_id) and len(folder_id) > 10, folder_id)

r = requests.post(f"{BASE}/subfolders", headers=HEADERS,
                  json={"folder_id": folder_id, "name": "Torte Light"})
check("POST /api/subfolders -> 200", r.status_code == 200, pretty(r))
subfolder = r.json()
subfolder_id = subfolder["id"]

# Recipe (use instagram reel URL which is a known platform; video extraction
# may fail but recipe will still be created with manual_caption)
recipe_payload = {
    "name": "Tiramisu Perfetto",
    "folder_id": folder_id,
    "subfolder_id": subfolder_id,
    "source_url": "https://www.instagram.com/reel/Ctest12345/",
    "manual_caption": "Ricetta classica del tiramisu con mascarpone e savoiardi",
    "notes": "Preparato per famiglia la domenica",
}
r = requests.post(f"{BASE}/recipes", headers=HEADERS, json=recipe_payload)
check("POST /api/recipes -> 200", r.status_code == 200, pretty(r))
recipe = r.json()
recipe_id = recipe["id"]
check("Recipe platform=instagram", recipe.get("platform") == "instagram", str(recipe.get("platform")))


# --- 2. PUT with full fields ------------------------------------------
section("2. PUT recipe with full fields")
put_payload = {
    "caption": "Ricetta classica del tiramisu con mascarpone e savoiardi - edited",
    "ingredients": "- 4 uova\n- 250g mascarpone\n- 100g zucchero\n- 300g savoiardi\n- caffe q.b.",
    "tags": ["dolce", "italiano", "classico"],
    "transcription": "Oggi vi mostro come preparare il vero tiramisu italiano...",
    "notes": "Da fare con mascarpone freschissimo",
    "is_favorite": True,
    "difficulty": "medio",
    "prep_time": 20,
    "cook_time": 45,
}
r = requests.put(f"{BASE}/recipes/{recipe_id}", headers=HEADERS, json=put_payload)
check("PUT /api/recipes/{id} -> 200", r.status_code == 200, pretty(r))
updated = r.json()
for k, v in put_payload.items():
    check(f"PUT persists {k}", updated.get(k) == v, f"got={updated.get(k)!r} expected={v!r}")
check("PUT auto-sets transcription_status=done",
      updated.get("transcription_status") == "done",
      str(updated.get("transcription_status")))


# --- 3. GET /api/recipes (full) ----------------------------------------
section("3. GET /api/recipes (no light) returns FULL recipes")
r = requests.get(f"{BASE}/recipes", headers=HEADERS)
check("GET /api/recipes -> 200", r.status_code == 200, pretty(r))
full_list = r.json()
check("Full list contains the recipe", any(x["id"] == recipe_id for x in full_list),
      f"ids={[x.get('id') for x in full_list]}")
target = next((x for x in full_list if x["id"] == recipe_id), {})
expected_full_keys = ["caption", "ingredients", "tags", "transcription", "notes",
                      "video_url", "difficulty", "prep_time", "cook_time",
                      "is_favorite", "name", "platform", "thumbnail_url",
                      "transcription_status", "ingredients_status",
                      "folder_id", "subfolder_id", "created_at", "id",
                      "source_url", "user_id"]
for key in expected_full_keys:
    check(f"Full GET has `{key}`", key in target, f"keys={list(target.keys())}")
check("Full GET caption matches", target.get("caption") == put_payload["caption"],
      str(target.get("caption"))[:60])
check("Full GET ingredients matches",
      target.get("ingredients") == put_payload["ingredients"],
      str(target.get("ingredients"))[:60])
check("Full GET tags matches",
      target.get("tags") == put_payload["tags"],
      str(target.get("tags")))


# --- 4. GET /api/recipes?light=true ------------------------------------
section("4. GET /api/recipes?light=true")
r = requests.get(f"{BASE}/recipes", headers=HEADERS, params={"light": "true"})
check("GET /api/recipes?light=true -> 200", r.status_code == 200, pretty(r))
light_list = r.json()
check("Light list contains the recipe", any(x.get("id") == recipe_id for x in light_list))
light_target = next((x for x in light_list if x.get("id") == recipe_id), {})

allowed_light_keys = {"id", "name", "platform", "thumbnail_url", "created_at",
                      "is_favorite", "transcription_status", "ingredients_status",
                      "folder_id", "subfolder_id"}
forbidden_light_keys = {"caption", "transcription", "ingredients", "tags", "notes",
                        "video_url", "difficulty", "prep_time", "cook_time",
                        "source_url", "user_id", "updated_at", "local_video_path",
                        "video_compressed"}

actual_keys = set(light_target.keys())
extra = actual_keys - allowed_light_keys
missing = allowed_light_keys - actual_keys
present_forbidden = forbidden_light_keys & actual_keys

check("Light projection has ONLY allowed keys",
      not extra,
      f"extra keys found: {extra}; all keys: {actual_keys}")
check("Light projection contains all required allowed keys",
      not missing,
      f"missing: {missing}")
check("Light projection has NO forbidden (heavy) keys",
      not present_forbidden,
      f"forbidden keys present: {present_forbidden}")

all_light_ok = all(set(x.keys()).issubset(allowed_light_keys) for x in light_list)
check("All light items restricted to allowed keys", all_light_ok,
      f"sample keys={list(light_list[0].keys()) if light_list else []}")


# --- 5. light + favorites ---------------------------------------------
section("5. GET /api/recipes?light=true&favorites=true")
r = requests.post(f"{BASE}/recipes", headers=HEADERS, json={
    "name": "Pasta al Pomodoro",
    "source_url": "https://www.instagram.com/reel/Ctest99999/",
    "manual_caption": "Pasta semplice",
})
check("POST second recipe -> 200", r.status_code == 200, pretty(r))
recipe2_id = r.json()["id"]

r = requests.get(f"{BASE}/recipes", headers=HEADERS,
                 params={"light": "true", "favorites": "true"})
check("GET light+favorites -> 200", r.status_code == 200, pretty(r))
fav_list = r.json()
check("Favorites filter returns only favorite (1 item)",
      len(fav_list) == 1 and fav_list[0].get("id") == recipe_id,
      f"got={[x.get('id') for x in fav_list]}")
check("Favorites response uses light projection",
      fav_list and set(fav_list[0].keys()).issubset(allowed_light_keys),
      f"keys={list(fav_list[0].keys()) if fav_list else []}")


# --- 6. light + folder_id ----------------------------------------------
section("6. GET /api/recipes?light=true&folder_id=<id>")
r = requests.get(f"{BASE}/recipes", headers=HEADERS,
                 params={"light": "true", "folder_id": folder_id})
check("GET light+folder_id -> 200", r.status_code == 200, pretty(r))
folder_list = r.json()
check("Folder filter returns only recipes in folder (1 item)",
      len(folder_list) == 1 and folder_list[0].get("id") == recipe_id,
      f"got={[x.get('id') for x in folder_list]}")
check("folder_id response light projection",
      folder_list and set(folder_list[0].keys()).issubset(allowed_light_keys),
      f"keys={list(folder_list[0].keys()) if folder_list else []}")
check("Light projection contains folder_id value",
      folder_list and folder_list[0].get("folder_id") == folder_id,
      f"got={folder_list[0].get('folder_id') if folder_list else None}")


# --- 7. light + search -------------------------------------------------
section("7. GET /api/recipes?light=true&search=<term>")

def search_light(term):
    return requests.get(f"{BASE}/recipes", headers=HEADERS,
                        params={"light": "true", "search": term})

r = search_light("Tiramisu")
check("search=Tiramisu -> 200", r.status_code == 200)
check("search=Tiramisu (name) matches recipe",
      any(x.get("id") == recipe_id for x in r.json()),
      pretty(r))
items = r.json()
check("search results use light projection",
      items and set(items[0].keys()).issubset(allowed_light_keys),
      f"keys={list(items[0].keys()) if items else []}")

r = search_light("mascarpone e savoiardi")
check("search=caption term matches",
      any(x.get("id") == recipe_id for x in r.json()), pretty(r))

r = search_light("mascarpone")
check("search=mascarpone (ingredients) matches",
      any(x.get("id") == recipe_id for x in r.json()), pretty(r))

r = search_light("classico")
check("search=classico (tag) matches",
      any(x.get("id") == recipe_id for x in r.json()), pretty(r))

r = search_light("vero tiramisu italiano")
check("search=transcription term matches",
      any(x.get("id") == recipe_id for x in r.json()), pretty(r))

r = search_light("mascarpone freschissimo")
check("search=notes term matches",
      any(x.get("id") == recipe_id for x in r.json()), pretty(r))

r = search_light("garbage-term-xyz-qwerty")
check("search unknown term -> empty list",
      r.json() == [], pretty(r))


# --- REGRESSION --------------------------------------------------------
section("R1. Folders/Subfolders CRUD regression")
r = requests.get(f"{BASE}/folders", headers=HEADERS)
check("GET /api/folders lists folder", any(x["id"] == folder_id for x in r.json()), pretty(r))

r = requests.get(f"{BASE}/folders/{folder_id}", headers=HEADERS)
check("GET /api/folders/{id} -> 200", r.status_code == 200, pretty(r))

r = requests.put(f"{BASE}/folders/{folder_id}", headers=HEADERS,
                 json={"name": "Dolci Light Test RENAMED"})
check("PUT folder -> 200", r.status_code == 200, pretty(r))
check("Folder name updated", r.json().get("name") == "Dolci Light Test RENAMED", pretty(r))

r = requests.get(f"{BASE}/folders/nonexistent-xxxxx", headers=HEADERS)
check("GET unknown folder -> 404", r.status_code == 404, pretty(r))

r = requests.get(f"{BASE}/subfolders", headers=HEADERS, params={"folder_id": folder_id})
check("GET subfolders with folder_id -> 200",
      r.status_code == 200 and any(x["id"] == subfolder_id for x in r.json()),
      pretty(r))

r = requests.put(f"{BASE}/subfolders/{subfolder_id}", headers=HEADERS,
                 json={"name": "Torte RENAMED"})
check("PUT subfolder -> 200", r.status_code == 200, pretty(r))


section("R2. POST /api/shopping-list/generate (needs full ingredients projection)")
r = requests.put(f"{BASE}/recipes/{recipe2_id}", headers=HEADERS,
                 json={"ingredients": "- 400g pasta\n- 500g pomodori\n- 100g zucchero\n- basilico q.b."})
check("PUT recipe2 ingredients -> 200", r.status_code == 200, pretty(r))

r = requests.post(f"{BASE}/shopping-list/generate", headers=HEADERS,
                  json={"recipe_ids": [recipe_id, recipe2_id], "language": "it"})
check("POST shopping-list/generate -> 200", r.status_code == 200, pretty(r))
sl = r.json() if r.status_code == 200 else {}
check("shopping list has id", bool(sl.get("id")), pretty(r))
check("shopping list items non-empty", len(sl.get("items", [])) > 0, pretty(r))
check("shopping list raw non-empty", bool(sl.get("raw")), pretty(r))
check("shopping list recipe_names len=2",
      len(sl.get("recipe_names", [])) == 2, pretty(r))
raw_lower = (sl.get("raw") or "").lower()
check("raw contains ingredient text (mascarpone/zucchero)",
      "mascarpone" in raw_lower or "zucchero" in raw_lower,
      f"raw={raw_lower[:200]}")

r = requests.post(f"{BASE}/shopping-list/generate", headers=HEADERS,
                  json={"recipe_ids": [], "language": "it"})
check("shopping empty ids -> 400", r.status_code == 400, pretty(r))

r = requests.post(f"{BASE}/shopping-list/generate", headers=HEADERS,
                  json={"recipe_ids": ["nonexistent-xxxx"], "language": "it"})
check("shopping unknown id -> 404", r.status_code == 404, pretty(r))


section("R3. GET /api/backup/export includes full fields")
r = requests.get(f"{BASE}/backup/export", headers=HEADERS)
check("GET /api/backup/export -> 200", r.status_code == 200, pretty(r))
bkp = r.json()
check("backup has version=1", bkp.get("version") == 1, str(bkp.get("version")))
check("backup has app name", bkp.get("app") == "Il Ricettario", str(bkp.get("app")))
check("backup folders non-empty", len(bkp.get("folders", [])) >= 1, "")
check("backup recipes non-empty", len(bkp.get("recipes", [])) >= 2, "")
bkp_recipe = next((rr for rr in bkp["recipes"] if rr.get("id") == recipe_id), None)
check("backup recipe exists", bkp_recipe is not None)
if bkp_recipe:
    for k in ["caption", "ingredients", "tags", "transcription", "notes",
              "difficulty", "prep_time", "cook_time", "is_favorite"]:
        check(f"backup recipe includes `{k}`", k in bkp_recipe,
              f"keys={list(bkp_recipe.keys())}")
    check("backup recipe caption preserved",
          bkp_recipe.get("caption") == put_payload["caption"])
    check("backup recipe tags preserved",
          bkp_recipe.get("tags") == put_payload["tags"])


section("R4. POST /api/backup/import works")
r = requests.post(f"{BASE}/backup/import", headers=HEADERS,
                  json={"data": bkp, "mode": "merge"})
check("POST backup/import merge -> 200", r.status_code == 200, pretty(r))
imp = r.json()
check("merge import skipped=all (nothing new)",
      imp.get("imported", {}).get("recipes", -1) == 0 and
      imp.get("imported", {}).get("folders", -1) == 0,
      pretty(r))

r = requests.post(f"{BASE}/backup/import", headers=HEADERS,
                  json={"data": bkp, "mode": "replace"})
check("POST backup/import replace -> 200", r.status_code == 200, pretty(r))
imp = r.json()
check("replace import folders >= 1",
      imp.get("imported", {}).get("folders", 0) >= 1, pretty(r))
check("replace import recipes >= 2",
      imp.get("imported", {}).get("recipes", 0) >= 2, pretty(r))

r = requests.get(f"{BASE}/recipes", headers=HEADERS)
check("After replace, recipes restored", len(r.json()) >= 2, pretty(r))
restored = next((x for x in r.json() if x.get("id") == recipe_id), None)
check("Restored recipe preserves tags",
      restored and restored.get("tags") == put_payload["tags"],
      str(restored.get("tags") if restored else None))


section("R5. /auth/me and PUT /auth/profile work")
r = requests.get(f"{BASE}/auth/me", headers=HEADERS)
check("GET /auth/me -> 200", r.status_code == 200, pretty(r))
me = r.json()
check("me has user_id", bool(me.get("user_id")), pretty(r))
check("me is device user", me.get("user_id", "").startswith("device_"), str(me.get("user_id")))

r = requests.get(f"{BASE}/auth/me")
check("GET /auth/me (no device) -> 200", r.status_code == 200, pretty(r))
check("no-device me -> local_user fallback",
      r.json().get("user_id") == "local_user", pretty(r))

r = requests.put(f"{BASE}/auth/profile", headers=HEADERS,
                 json={"name": "Chef Test"})
check("PUT /auth/profile -> 200", r.status_code == 200, pretty(r))
resp = r.json()
check("PUT /auth/profile body not null", resp is not None, str(resp))
check("PUT /auth/profile updated name",
      resp and resp.get("name") == "Chef Test",
      str(resp))


section("R6. User isolation for ?light=true")
r = requests.get(f"{BASE}/recipes", headers=HEADERS_OTHER,
                 params={"light": "true"})
check("Other device sees no recipes via light=true",
      r.status_code == 200 and r.json() == [],
      pretty(r))


section("Cleanup")
r = requests.delete(f"{BASE}/recipes/{recipe2_id}", headers=HEADERS)
check("DELETE recipe2 -> 200", r.status_code == 200, pretty(r))

r = requests.delete(f"{BASE}/folders/{folder_id}", headers=HEADERS)
check("DELETE folder (cascade) -> 200", r.status_code == 200, pretty(r))

r = requests.get(f"{BASE}/recipes/{recipe_id}", headers=HEADERS)
check("Recipe deleted by folder cascade -> 404", r.status_code == 404, pretty(r))


print("\n" + "="*60)
print(f"TOTAL: {len(PASSED)} passed, {len(FAILED)} failed")
print("="*60)
if FAILED:
    print("\nFAILURES:")
    for name, detail in FAILED:
        print(f"  FAIL {name}")
        print(f"      {detail}")
    sys.exit(1)
else:
    print("ALL TESTS PASSED")
    sys.exit(0)
