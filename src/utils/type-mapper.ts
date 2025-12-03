/**
 * Maps database/source types to GraphQL types
 */

import {
  toPascalCase as namingToPascalCase,
  toCamelCase as namingToCamelCase,
  pascalToSnake,
} from './naming';

// Re-export all naming utilities for convenience
export * from './naming';

export class TypeMapper {
  /**
   * Maps MongoDB BSON types to GraphQL types
   */
  static mapMongoDBType(value: any): string {
    if (value === null || value === undefined) {
      return 'String';
    }

    const type = typeof value;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return 'JSON'; // Unknown array type, use JSON scalar
      }
      return this.mapMongoDBType(value[0]);
    }

    switch (type) {
      case 'string':
        // Check if it's a date string or ObjectId
        if (this.isISODate(value)) {
          return 'String'; // Could use DateTime scalar
        }
        if (this.isObjectId(value)) {
          return 'ID';
        }
        return 'String';

      case 'number':
        // GraphQL Int can only represent 32-bit signed integers (-2^31 to 2^31-1)
        // If the number is outside this range, use Float instead
        if (Number.isInteger(value)) {
          const MAX_INT_32 = 2147483647;
          const MIN_INT_32 = -2147483648;
          if (value > MAX_INT_32 || value < MIN_INT_32) {
            return 'Float'; // Use Float for large integers (e.g., timestamps in milliseconds)
          }
          return 'Int';
        }
        return 'Float';

      case 'boolean':
        return 'Boolean';

      case 'object':
        if (value instanceof Date) {
          return 'String'; // Could use DateTime scalar
        }
        if (value.constructor?.name === 'ObjectId' || value._bsontype === 'ObjectId') {
          return 'ID';
        }
        // Nested object - return JSON scalar
        return 'JSON';

      default:
        return 'JSON';
    }
  }

  /**
   * Maps SQL types to GraphQL types
   */
  static mapSQLType(sqlType: string): string {
    const lowerType = sqlType.toLowerCase();

    // Integer types
    if (lowerType.includes('int') || lowerType.includes('serial')) {
      return 'Int';
    }

    // Float types
    if (lowerType.includes('float') || lowerType.includes('double') || 
        lowerType.includes('decimal') || lowerType.includes('numeric') ||
        lowerType.includes('real')) {
      return 'Float';
    }

    // Boolean types
    if (lowerType.includes('bool') || lowerType === 'bit') {
      return 'Boolean';
    }

    // Date/Time types
    if (lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('timestamp')) {
      return 'String'; // Could use DateTime scalar
    }

    // JSON types
    if (lowerType.includes('json')) {
      return 'JSON';
    }

    // Binary types
    if (lowerType.includes('blob') || lowerType.includes('binary') || lowerType.includes('bytea')) {
      return 'String'; // Base64 encoded
    }

    // Default to String for text types and unknowns
    return 'String';
  }

  /**
   * Infers GraphQL type from JavaScript value
   */
  static inferTypeFromValue(value: any): string {
    if (value === null || value === undefined) {
      return 'String';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return 'JSON';
      }
      return this.inferTypeFromValue(value[0]);
    }

    const type = typeof value;
    
    switch (type) {
      case 'string':
        return 'String';
      case 'number':
        return Number.isInteger(value) ? 'Int' : 'Float';
      case 'boolean':
        return 'Boolean';
      case 'object':
        if (value instanceof Date) {
          return 'String';
        }
        return 'JSON';
      default:
        return 'JSON';
    }
  }

  private static isISODate(str: string): boolean {
    if (typeof str !== 'string') return false;
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    return isoDateRegex.test(str);
  }

  private static isObjectId(str: string): boolean {
    if (typeof str !== 'string') return false;
    return /^[0-9a-fA-F]{24}$/.test(str);
  }

  /**
   * Sanitizes field names to be GraphQL compatible
   */
  static sanitizeFieldName(name: string): string {
    // Remove invalid characters and ensure it starts with a letter or underscore
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    
    if (!/^[a-zA-Z_]/.test(sanitized)) {
      sanitized = '_' + sanitized;
    }

    return sanitized;
  }

  /**
   * Converts collection/table names to PascalCase for GraphQL types
   * @deprecated Use toPascalCase from './naming' directly for new code
   */
  static toPascalCase(str: string): string {
    return namingToPascalCase(str);
  }

  /**
   * Converts names to camelCase for query names
   * @deprecated Use toCamelCase from './naming' directly for new code
   */
  static toCamelCase(str: string): string {
    return namingToCamelCase(str);
  }

  /**
   * Converts PascalCase to snake_case
   * Example: EmbeddedMovie -> embedded_movie
   * @deprecated Use pascalToSnake from './naming' directly for new code
   */
  static toSnakeCase(str: string): string {
    return pascalToSnake(str);
  }

  /**
   * Converts plural form to singular
   */
  static singularize(word: string): string {
    const lower = word.toLowerCase();
    
    // Common irregular plurals
    const irregulars: Record<string, string> = {
      'people': 'person',
      'men': 'man',
      'women': 'woman',
      'children': 'child',
      'teeth': 'tooth',
      'feet': 'foot',
      'mice': 'mouse',
      'geese': 'goose',
      'movies': 'movie',
      'series': 'series',
      'species': 'species',
    };

    if (irregulars[lower]) {
      return irregulars[lower];
    }

    // Handle compound words (e.g., "embedded_movies" -> "embedded_movie")
    // Split by underscore, singularize the last part, then rejoin
    if (lower.includes('_')) {
      const parts = lower.split('_');
      const lastPart = parts[parts.length - 1];
      const singularizedLast = this.singularizeWord(lastPart);
      parts[parts.length - 1] = singularizedLast;
      return parts.join('_');
    }

    return this.singularizeWord(lower);
  }

  /**
   * Singularizes a single word (helper for singularize)
   */
  private static singularizeWord(word: string): string {
    const lower = word.toLowerCase();
    
    // Check irregular plurals first
    const irregulars: Record<string, string> = {
      'people': 'person',
      'men': 'man',
      'women': 'woman',
      'children': 'child',
      'teeth': 'tooth',
      'feet': 'foot',
      'mice': 'mouse',
      'geese': 'goose',
      'movies': 'movie',
      'series': 'series',
      'species': 'species',
    };

    if (irregulars[lower]) {
      return irregulars[lower];
    }
    
    // Words ending in 'ies' - convert to 'y'
    if (lower.endsWith('ies') && lower.length > 4) {
      return lower.slice(0, -3) + 'y';
    }

    // Words ending in 'ves' - convert to 'f' or 'fe'
    if (lower.endsWith('ves')) {
      return lower.slice(0, -3) + 'f';
    }

    // Words ending in 'ses', 'xes', 'zes' - remove 'es'
    if (lower.endsWith('ses') || lower.endsWith('xes') || lower.endsWith('zes')) {
      return lower.slice(0, -2);
    }
    
    // Words ending in 'ches', 'shes' - remove 'es'
    if (lower.endsWith('ches') || lower.endsWith('shes')) {
      return lower.slice(0, -2);
    }

    // Words ending in 'oes' - remove 'es'  
    if (lower.endsWith('oes')) {
      return lower.slice(0, -2);
    }

    // Words ending in 's' (but not 'ss' or 'us')
    if (lower.endsWith('s') && !lower.endsWith('ss') && !lower.endsWith('us')) {
      return lower.slice(0, -1);
    }

    // Already singular
    return lower;
  }

  /**
   * Converts singular form to plural (improved version)
   */
  static pluralize(word: string): string {
    const lower = word.toLowerCase();

    // Common irregular plurals
    const irregulars: Record<string, string> = {
      'person': 'people',
      'man': 'men',
      'woman': 'women',
      'child': 'children',
      'tooth': 'teeth',
      'foot': 'feet',
      'mouse': 'mice',
      'goose': 'geese',
    };

    if (irregulars[lower]) {
      return irregulars[lower];
    }

    // Already plural (ends with 's' and has specific patterns)
    if (lower.endsWith('s') && (
      lower.endsWith('ies') ||
      lower.endsWith('oes') ||
      lower.endsWith('ses') ||
      lower.endsWith('xes') ||
      lower.endsWith('zes') ||
      lower.endsWith('ches') ||
      lower.endsWith('shes')
    )) {
      return lower;
    }

    // Words ending in 'y' preceded by a consonant
    if (lower.endsWith('y') && lower.length > 1 && !/[aeiou]y$/.test(lower)) {
      return lower.slice(0, -1) + 'ies';
    }

    // Words ending in 'f' or 'fe'
    if (lower.endsWith('f')) {
      return lower.slice(0, -1) + 'ves';
    }
    if (lower.endsWith('fe')) {
      return lower.slice(0, -2) + 'ves';
    }

    // Words ending in 's', 'x', 'z', 'ch', 'sh'
    if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('z') || 
        lower.endsWith('ch') || lower.endsWith('sh')) {
      return lower + 'es';
    }

    // Words ending in 'o' preceded by a consonant
    if (lower.endsWith('o') && lower.length > 1 && !/[aeiou]o$/.test(lower)) {
      return lower + 'es';
    }

    // Default: just add 's'
    return lower + 's';
  }

  /**
   * Extracts the common semantic suffix from multiple type names
   * Used for type consolidation to generate shared type names
   *
   * @example
   * extractCommonTypeSuffix(['ArticleAuthor', 'BlogPostAuthor']) // 'Author'
   * extractCommonTypeSuffix(['LearningPathTopics', 'ArticleTopics']) // 'Topics'
   * extractCommonTypeSuffix(['UserProfile', 'ProductDetails']) // null (no common suffix)
   */
  static extractCommonTypeSuffix(typeNames: string[]): string | null {
    if (typeNames.length < 2) return null;

    // Find the longest common suffix among all type names
    const findCommonSuffix = (names: string[]): string => {
      if (names.length === 0) return '';

      let suffix = '';
      const shortest = names.reduce((a, b) => a.length < b.length ? a : b);

      // Check each position from the end
      for (let i = 1; i <= shortest.length; i++) {
        const char = shortest[shortest.length - i];
        const allMatch = names.every(name => name[name.length - i] === char);

        if (allMatch) {
          suffix = char + suffix;
        } else {
          break;
        }
      }

      return suffix;
    };

    const commonSuffix = findCommonSuffix(typeNames);

    // Extract the semantic part (must start with uppercase and be at least 3 chars)
    // Example: "Author" from "thorAuthor", "Topics" from "icsTopics"
    const semanticMatch = commonSuffix.match(/([A-Z][a-z]*(?:[A-Z][a-z]*)*)$/);

    if (semanticMatch && semanticMatch[1].length >= 3) {
      return semanticMatch[1];
    }

    return null;
  }

  /**
   * Generates a semantic shared type name for consolidated types
   * Uses common suffix extraction, field pattern detection, or fallback naming
   *
   * @param typeNames - Array of type names being consolidated
   * @param fields - Set of field names in the consolidated type
   * @returns A semantic name for the shared type
   */
  static generateSharedTypeName(typeNames: string[], fields: Set<string>): string {
    const fieldList = Array.from(fields);

    // STEP 1: Try to extract common suffix from type names
    const commonSuffix = this.extractCommonTypeSuffix(typeNames);
    if (commonSuffix) {
      // Singularize if it's plural (e.g., "Authors" -> "Author")
      // Ensure result is PascalCase
      const singular = this.singularizeWord(commonSuffix);
      return singular.charAt(0).toUpperCase() + singular.slice(1);
    }

    // STEP 2: Check if this looks like localized content (has language codes)
    const languageCodes = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'ru', 'hi', 'nl'];
    const hasLanguageFields = fieldList.some(field => languageCodes.includes(field.toLowerCase()));
    if (hasLanguageFields) {
      return 'LocalizedContent';
    }

    // STEP 3: Check for common structural patterns
    if (fieldList.includes('title') && fieldList.includes('description')) {
      return 'TitleDescription';
    }
    if (fieldList.includes('name') && fieldList.includes('value')) {
      return 'NameValue';
    }
    if (fieldList.includes('key') && fieldList.includes('value')) {
      return 'KeyValue';
    }
    if (fieldList.includes('label') && fieldList.includes('value')) {
      return 'LabelValue';
    }
    if (fieldList.includes('id') && fieldList.includes('name') && fieldList.length === 2) {
      return 'IdName';
    }
    if (fieldList.includes('url') && fieldList.includes('alt')) {
      return 'ImageRef';
    }
    if (fieldList.includes('href') || (fieldList.includes('url') && fieldList.includes('text'))) {
      return 'Link';
    }

    // STEP 4: Fallback - use the shortest type name as base and add "Shared"
    const shortest = typeNames.reduce((a, b) => a.length <= b.length ? a : b);
    // Extract the last PascalCase word and append "Shared"
    const lastWordMatch = shortest.match(/([A-Z][a-z]+)$/);
    if (lastWordMatch) {
      return `Shared${lastWordMatch[1]}`;
    }

    return `${shortest}Shared`;
  }

  /**
   * Generates an abbreviation from a PascalCase type name
   * Extracts uppercase letters to create a short prefix
   *
   * @param typeName - The PascalCase type name
   * @returns An abbreviation (e.g., 'LearningPathResource' -> 'LPR')
   *
   * @example
   * abbreviateTypeName('LearningPathResource') // 'LPR'
   * abbreviateTypeName('CheatSheet') // 'CS'
   * abbreviateTypeName('EBook') // 'EB'
   */
  static abbreviateTypeName(typeName: string): string {
    // Extract uppercase letters (word boundaries in PascalCase)
    const upperLetters = typeName.match(/[A-Z]/g);
    if (!upperLetters || upperLetters.length === 0) {
      return typeName.substring(0, 3).toUpperCase();
    }
    return upperLetters.join('');
  }

  /**
   * Generates a clean nested type name from parent type and field name
   * Uses abbreviated parent name for shorter type names
   *
   * @param parentTypeName - The parent type name
   * @param fieldName - The field name for the nested type
   * @returns A clean nested type name with abbreviated parent
   *
   * @example
   * generateNestedTypeName('LearningPathResource', 'cheatSheet') // 'LPRCheatSheet'
   * generateNestedTypeName('LearningPathResource', 'article') // 'LPRArticle'
   * generateNestedTypeName('LPRArticle', 'contentMetatags') // 'LPRArticleContentMetatags'
   */
  static generateNestedTypeName(parentTypeName: string, fieldName: string): string {
    const fieldPascal = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);

    // Remove "Index" artifacts from parent type name
    const cleanParent = parentTypeName.replace(/Index/g, '');

    // Check if parent is already abbreviated (all uppercase or short)
    const isAlreadyAbbreviated = cleanParent === cleanParent.toUpperCase() ||
                                  cleanParent.length <= 5 ||
                                  /^[A-Z]{2,5}[A-Z][a-z]/.test(cleanParent); // e.g., LPRArticle

    if (isAlreadyAbbreviated) {
      // Parent is already abbreviated, just append field name
      return `${cleanParent}${fieldPascal}`;
    }

    // Abbreviate the parent type name
    const abbreviatedParent = this.abbreviateTypeName(cleanParent);
    return `${abbreviatedParent}${fieldPascal}`;
  }

  /**
   * Checks if two sets of field names are identical
   * Used for type consolidation to determine if types can be merged
   */
  static areFieldSetsIdentical(fieldsA: Set<string>, fieldsB: Set<string>): boolean {
    if (fieldsA.size !== fieldsB.size) return false;
    for (const field of fieldsA) {
      if (!fieldsB.has(field)) return false;
    }
    return true;
  }

  /**
   * Generates a field signature for type consolidation
   * In strict mode, includes field types; in loose mode, only field names
   *
   * @param fields - Array of field definitions
   * @param mode - 'strict' includes types, 'loose' only names
   * @returns A signature string for comparison
   */
  static generateFieldSignature(
    fields: Array<{ name: string; type: string }>,
    mode: 'strict' | 'loose' = 'strict'
  ): string {
    const sortedFields = [...fields].sort((a, b) => a.name.localeCompare(b.name));

    if (mode === 'loose') {
      return sortedFields.map(f => f.name).join('|');
    }

    // Strict mode: include types
    return sortedFields.map(f => `${f.name}:${f.type}`).join('|');
  }
}

