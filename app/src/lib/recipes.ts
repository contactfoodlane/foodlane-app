import Papa from "papaparse";

export type Recipe = {
  id: string;
  type: string; // Type (sucré/salé)
  difficulte: string; // Difficulté (Facile/Moyen/Difficile)
  temps_preparation_min: number;
  categorie_temps: string; // Catégorie temps (sélection)
  nb_personnes: number;
  nom: string;
  description_courte: string;
  ingredients: string; // Ingrédients + quantités (séparés par ;)
  instructions: string; // Instructions (étapes séparées par ;)
  equipements: string; // Équipements nécessaires (séparés par ;)
  calories?: number; // Calories pour une portion
  image_url?: string;
};

type RawRow = {
  [key: string]: string | undefined;
};

export async function fetchRecipesFromSheet(): Promise<Recipe[]> {
  let url = process.env.SHEET_RECIPES_CSV_URL;

  if (!url) {
    console.error("[Recipes] SHEET_RECIPES_CSV_URL n'est pas défini");
    throw new Error("SHEET_RECIPES_CSV_URL is not defined. Vérifiez votre fichier .env.local");
  }

  // Nettoyer l'URL si elle contient le nom de la variable (ex: "SHEET_RECIPES_CSV_URL=https://...")
  if (url.startsWith("SHEET_RECIPES_CSV_URL=")) {
    url = url.replace(/^SHEET_RECIPES_CSV_URL=/, "");
    console.warn("[Recipes] L'URL contenait le nom de la variable, nettoyage effectué");
  }

  // Vérifier que c'est bien une URL valide
  try {
    new URL(url);
  } catch (e) {
    console.error("[Recipes] URL invalide:", url);
    throw new Error(`URL invalide pour SHEET_RECIPES_CSV_URL: "${url}". Vérifiez votre fichier .env.local`);
  }

  console.log("[Recipes] Tentative de récupération depuis:", url);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      next: { revalidate: 0 }, // Désactiver complètement le cache
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/csv,text/plain,*/*',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://docs.google.com/',
        'Origin': 'https://docs.google.com',
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error(`[Recipes] Erreur HTTP ${res.status} lors du téléchargement du CSV:`, errorText.substring(0, 200));
      throw new Error(`Erreur lors du téléchargement du CSV: ${res.status} - ${res.statusText}`);
    }

    const csvText = await res.text();
    
    if (!csvText || csvText.trim().length === 0) {
      console.error("[Recipes] Le CSV téléchargé est vide");
      throw new Error("Le fichier CSV téléchargé est vide");
    }

    console.log(`[Recipes] CSV téléchargé: ${csvText.length} caractères`);

    const parsed = Papa.parse<RawRow>(csvText, {
      header: true,        // 🔴 On utilise les NOMS de colonnes
      skipEmptyLines: true,
    });

    const rows = parsed.data;

    // Vérifier les colonnes disponibles (pour débogage)
    if (rows.length > 0) {
      const firstRow = rows[0];
      const availableColumns = Object.keys(firstRow);
      console.log("[Recipes] Colonnes disponibles dans le CSV:", availableColumns);
      
      // Vérifier que les colonnes attendues existent
      const requiredColumns = [
        "Type (sucré/salé)",
        "Difficulté (Facile/Moyen/Difficile)",
        "Temps de préparation (min)",
        "Catégorie temps (sélection)",
        "Nombre de personnes",
        "Nom de la recette",
        "Description courte",
        "Ingrédients + quantités (séparés par ;)",
        "Instructions (étapes séparées par ;)",
        "Équipements nécessaires (séparés par ;)",
        "Calories (pour une portion)",
        "image_url"
      ];
      
      const missingColumns = requiredColumns.filter(col => !availableColumns.includes(col));
      if (missingColumns.length > 0) {
        console.warn("[Recipes] Colonnes manquantes:", missingColumns);
      }
    }

    const recipes: Recipe[] = rows
      .filter((row) => {
        const nom = row["Nom de la recette"];
        return nom && nom.trim().length > 0;
      })
      .map((row, index) => {
        // Utiliser exactement les noms de colonnes de la base de données
        const type = (row["Type (sucré/salé)"] || "").trim();
        const difficulte = (row["Difficulté (Facile/Moyen/Difficile)"] || "").trim();
        const tempsPrep = (row["Temps de préparation (min)"] || "").trim();
        const categorieTemps = (row["Catégorie temps (sélection)"] || "").trim();
        const nbPersonnes = (row["Nombre de personnes"] || "").trim();
        const nom = (row["Nom de la recette"] || "").trim();
        const description = (row["Description courte"] || "").trim();
        const ingredients = (row["Ingrédients + quantités (séparés par ;)"] || "").trim();
        const instructions = (row["Instructions (étapes séparées par ;)"] || "").trim();
        const equipements = (row["Équipements nécessaires (séparés par ;)"] || "").trim();
        const calories = (row["Calories (pour une portion)"] || "").trim();
        const imageUrl = (row["image_url"] || "").trim();
        
        return {
          id:
            (row["ID"] && row["ID"]!.toString().trim()) ||
            `R_${index + 1}`,
          type,
          difficulte,
          temps_preparation_min: tempsPrep ? Number(tempsPrep) : 0,
          categorie_temps: categorieTemps,
          nb_personnes: nbPersonnes ? Number(nbPersonnes) : 0,
          nom,
          description_courte: description,
          ingredients,
          instructions,
          equipements,
          calories: calories ? Number(calories) : undefined,
          image_url: imageUrl,
        };
      });
    
    // Log pour vérifier la répartition par type
    const sweetCount = recipes.filter(r => {
      const type = (r.type?.toLowerCase() || "").trim();
      return type.includes("sucré") || type.includes("sucree") || type.includes("sucr");
    }).length;
    const savoryCount = recipes.filter(r => {
      const type = (r.type?.toLowerCase() || "").trim();
      return type.includes("salé") || type.includes("sale") || type.includes("sal");
    }).length;
    console.log(`[Recipes] ${recipes.length} recettes chargées (${sweetCount} sucrées, ${savoryCount} salées)`);

    return recipes;
  } catch (error) {
    console.error("[Recipes] Erreur lors de la récupération des recettes:", error);
    if (error instanceof Error) {
      throw error; // Re-lancer l'erreur avec le message original
    }
    throw new Error("Erreur inconnue lors de la récupération des recettes");
  }
}

