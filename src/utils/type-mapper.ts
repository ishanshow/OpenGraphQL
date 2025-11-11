/**
 * Maps database/source types to GraphQL types
 */

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
        return Number.isInteger(value) ? 'Int' : 'Float';
      
      case 'boolean':
        return 'Boolean';
      
      case 'object':
        if (value instanceof Date) {
          return 'String'; // Could use DateTime scalar
        }
        if (value.constructor.name === 'ObjectId' || value._bsontype === 'ObjectId') {
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
   */
  static toPascalCase(str: string): string {
    return str
      .split(/[-_\s]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Converts names to camelCase for query names
   */
  static toCamelCase(str: string): string {
    const pascal = this.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  /**
   * Converts PascalCase to snake_case
   * Example: EmbeddedMovie -> embedded_movie
   */
  static toSnakeCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, ''); // Remove leading underscore
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
}

