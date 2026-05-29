"""
Backend API Tests for NEW FEATURES in Il Ricettario
Tests: Random Recipes, AI Recipe Generation (Gemini 2.5 Flash)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'http://localhost:8000').rstrip('/')

class TestRandomRecipes:
    """Test random recipes endpoint for 'Cosa cuciniamo oggi?' section"""
    
    def test_get_random_recipes_default(self):
        """GET /api/recipes/random returns 3 random recipes by default"""
        response = requests.get(f"{BASE_URL}/api/recipes/random")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should return up to 3 recipes (may be less if DB has fewer recipes)
        assert len(data) <= 3
        print(f"✓ Random recipes endpoint returned {len(data)} recipes")
        
        # Verify recipe structure
        if len(data) > 0:
            recipe = data[0]
            assert "id" in recipe
            assert "name" in recipe
            assert "thumbnail_url" in recipe
            assert "platform" in recipe
            assert "created_at" in recipe
            print("✓ Random recipe structure is correct")
    
    def test_get_random_recipes_with_count(self):
        """GET /api/recipes/random?count=2 returns specified number"""
        response = requests.get(f"{BASE_URL}/api/recipes/random?count=2")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) <= 2
        print(f"✓ Random recipes with count=2 returned {len(data)} recipes")
    
    def test_random_recipes_no_duplicates_in_single_call(self):
        """Verify random recipes don't contain duplicates in single call"""
        response = requests.get(f"{BASE_URL}/api/recipes/random?count=3")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 1:
            recipe_ids = [r["id"] for r in data]
            assert len(recipe_ids) == len(set(recipe_ids)), "Found duplicate recipes in random results"
            print("✓ No duplicates in random recipes")


class TestAIRecipeGeneration:
    """Test AI recipe generation using Gemini 2.5 Flash"""
    
    def test_get_existing_recipe(self):
        """Get an existing recipe to test AI generation"""
        response = requests.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200
        data = response.json()
        assert len(data) > 0, "No recipes found in database"
        
        # Find TEST_Tiramisu or use first recipe
        recipe = None
        for r in data:
            if "TEST_Tiramisu" in r["name"] or "Tiramisu" in r["name"]:
                recipe = r
                break
        
        if not recipe:
            recipe = data[0]
        
        pytest.test_recipe_id = recipe["id"]
        pytest.test_recipe_name = recipe["name"]
        print(f"✓ Found recipe for testing: {recipe['name']} (ID: {recipe['id']})")
    
    def test_trigger_ai_recipe_generation(self):
        """POST /api/recipes/{id}/generate-recipe triggers AI generation"""
        if not hasattr(pytest, 'test_recipe_id'):
            pytest.skip("No test_recipe_id available")
        
        response = requests.post(f"{BASE_URL}/api/recipes/{pytest.test_recipe_id}/generate-recipe")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data or "status" in data
        assert data.get("status") == "pending" or "avviata" in data.get("message", "")
        print("✓ AI recipe generation triggered successfully")
    
    def test_recipe_status_becomes_pending(self):
        """Verify recipe transcription_status becomes 'pending' immediately"""
        if not hasattr(pytest, 'test_recipe_id'):
            pytest.skip("No test_recipe_id available")
        
        # Wait a moment for status to update
        time.sleep(1)
        
        response = requests.get(f"{BASE_URL}/api/recipes/{pytest.test_recipe_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["transcription_status"] in ["pending", "done"], f"Expected 'pending' or 'done', got '{data['transcription_status']}'"
        print(f"✓ Recipe status is: {data['transcription_status']}")
    
    def test_poll_until_ai_generation_complete(self):
        """Poll recipe until transcription_status becomes 'done'"""
        if not hasattr(pytest, 'test_recipe_id'):
            pytest.skip("No test_recipe_id available")
        
        max_attempts = 20  # 20 attempts * 3 seconds = 60 seconds max
        attempt = 0
        
        while attempt < max_attempts:
            response = requests.get(f"{BASE_URL}/api/recipes/{pytest.test_recipe_id}")
            assert response.status_code == 200
            data = response.json()
            
            status = data["transcription_status"]
            print(f"  Attempt {attempt + 1}: Status = {status}")
            
            if status == "done":
                print("✓ AI recipe generation completed successfully")
                pytest.generated_recipe = data["transcription"]
                return
            elif status == "error":
                print(f"✗ AI generation failed with error: {data.get('transcription', 'Unknown error')}")
                pytest.fail(f"AI generation failed: {data.get('transcription')}")
            
            time.sleep(3)
            attempt += 1
        
        pytest.fail("AI generation did not complete within 60 seconds")
    
    def test_verify_generated_recipe_content(self):
        """Verify generated recipe has proper Italian content"""
        if not hasattr(pytest, 'generated_recipe'):
            pytest.skip("No generated recipe available")
        
        recipe_text = pytest.generated_recipe
        assert len(recipe_text) > 50, "Generated recipe is too short"
        
        # Check for Italian recipe structure markers
        italian_markers = ["INGREDIENTI", "PROCEDIMENTO", "ingredienti", "procedimento", "🍽️", "📝", "👨‍🍳"]
        has_marker = any(marker in recipe_text for marker in italian_markers)
        assert has_marker, "Generated recipe doesn't contain expected Italian recipe structure"
        
        print(f"✓ Generated recipe is valid (length: {len(recipe_text)} chars)")
        print(f"  Preview: {recipe_text[:150]}...")
    
    def test_verify_recipe_persisted_in_db(self):
        """Verify generated recipe is persisted in database"""
        if not hasattr(pytest, 'test_recipe_id'):
            pytest.skip("No test_recipe_id available")
        
        response = requests.get(f"{BASE_URL}/api/recipes/{pytest.test_recipe_id}")
        assert response.status_code == 200
        data = response.json()
        
        assert data["transcription_status"] == "done"
        assert data["transcription"] is not None
        assert len(data["transcription"]) > 50
        print("✓ Generated recipe persisted correctly in database")


class TestSearchAndUpdate:
    """Verify existing search and update features still work"""
    
    def test_search_recipes(self):
        """GET /api/recipes?search=tiramisu searches correctly"""
        response = requests.get(f"{BASE_URL}/api/recipes?search=tiramisu")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Search for 'tiramisu' returned {len(data)} results")
    
    def test_update_recipe_fields(self):
        """PUT /api/recipes/{id} updates name/caption/notes"""
        if not hasattr(pytest, 'test_recipe_id'):
            pytest.skip("No test_recipe_id available")
        
        # Get current recipe
        get_response = requests.get(f"{BASE_URL}/api/recipes/{pytest.test_recipe_id}")
        original = get_response.json()
        
        # Update with new values
        response = requests.put(
            f"{BASE_URL}/api/recipes/{pytest.test_recipe_id}",
            json={
                "name": original["name"] + " (Updated)",
                "caption": "Updated caption for testing",
                "notes": "Updated notes for testing"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "(Updated)" in data["name"]
        assert data["caption"] == "Updated caption for testing"
        assert data["notes"] == "Updated notes for testing"
        
        # Verify persistence
        verify_response = requests.get(f"{BASE_URL}/api/recipes/{pytest.test_recipe_id}")
        verified = verify_response.json()
        assert "(Updated)" in verified["name"]
        assert verified["notes"] == "Updated notes for testing"
        
        # Restore original name
        requests.put(
            f"{BASE_URL}/api/recipes/{pytest.test_recipe_id}",
            json={"name": original["name"]}
        )
        
        print("✓ Recipe update (name/caption/notes) works correctly")
