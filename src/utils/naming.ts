/**
 * Naming Utilities Module
 *
 * Centralized naming conversion functions used across the GraphQL generation tooling.
 * This module consolidates naming logic to avoid duplication and ensure consistency.
 */

/**
 * Convert snake_case to camelCase
 * @param str - The snake_case string to convert
 * @returns The camelCase version
 * @example snakeToCamel('learning_path_resource') => 'learningPathResource'
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to space-separated lowercase words
 * @param camelCase - The camelCase string to convert
 * @returns Space-separated lowercase words
 * @example camelCaseToWords('learningPathResource') => 'learning path resource'
 */
export function camelCaseToWords(camelCase: string): string {
  return camelCase.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
}

/**
 * Convert collection name to PascalCase GraphQL type name
 * Removes trailing 's' and 'index' patterns
 * @param collectionName - MongoDB collection name
 * @returns PascalCase type name suitable for GraphQL
 * @example collectionNameToTypeName('learning_path_resources') => 'LearningPathResource'
 */
export function collectionNameToTypeName(collectionName: string): string {
  return collectionName.charAt(0).toUpperCase() +
         collectionName.slice(1).replace(/s$/, '').replace(/[Ii]ndex/g, '');
}

/**
 * Convert PascalCase or camelCase to snake_case
 * Handles both PascalCase (LearningPath) and camelCase (learningPath) inputs
 * @param str - The PascalCase or camelCase string to convert
 * @returns The snake_case version
 * @example pascalToSnake('LearningPathResource') => 'learning_path_resource'
 * @example pascalToSnake('learningPathResource') => 'learning_path_resource'
 * @example pascalToSnake('object') => 'object'
 */
export function pascalToSnake(str: string): string {
  if (!str || str.length === 0) return str;

  // Insert underscore before each uppercase letter, then lowercase everything
  const result = str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase();

  // Remove leading underscore if present (from PascalCase input)
  return result.startsWith('_') ? result.substring(1) : result;
}

/**
 * Convert PascalCase to camelCase
 * @param pascalCase - The PascalCase string to convert
 * @returns The camelCase version
 * @example pascalToCamel('LearningPathResource') => 'learningPathResource'
 */
export function pascalToCamel(pascalCase: string): string {
  return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
}

/**
 * Convert camelCase to PascalCase
 * @param camelCase - The camelCase string to convert
 * @returns The PascalCase version
 * @example camelToPascal('learningPathResource') => 'LearningPathResource'
 */
export function camelToPascal(camelCase: string): string {
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
}

/**
 * Convert any string to PascalCase
 * Handles snake_case, kebab-case, and space-separated words
 * @param str - The string to convert
 * @returns The PascalCase version
 * @example toPascalCase('learning_path_resource') => 'LearningPathResource'
 * @example toPascalCase('learning-path-resource') => 'LearningPathResource'
 */
export function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert any string to camelCase
 * Handles snake_case, kebab-case, and space-separated words
 * @param str - The string to convert
 * @returns The camelCase version
 * @example toCamelCase('learning_path_resource') => 'learningPathResource'
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export interface EntityNames {
  /** PascalCase for type definitions (e.g., 'LearningPathResource') */
  typeName: string;
  /** Alias for typeName - for backward compatibility with old code */
  typeNamePascalCase: string;
  /** camelCase for variables and field names (e.g., 'learningPathResource') */
  typeNameCamelCase: string;
  /** snake_case for query names single (e.g., 'learning_path_resource') */
  queryNameOne: string;
  /** camelCase plural for query names (e.g., 'learningPathResources') */
  queryNameAll: string;
  /** snake_case plural for GraphQL resolvers (e.g., 'learning_path_resources') */
  queryNameAllSnakeCase: string;
}

/**
 * Generate derived entity names from a collection name
 * This centralizes the logic for generating all naming variations used across the codebase
 *
 * @param collectionName - MongoDB collection name
 * @returns Object containing all naming variations
 * @example
 * generateEntityNames('learning_path_resources') => {
 *   typeName: 'LearningPathResource',
 *   typeNamePascalCase: 'LearningPathResource',
 *   typeNameCamelCase: 'learningPathResource',
 *   queryNameOne: 'learning_path_resource',
 *   queryNameAll: 'learningPathResources',
 *   queryNameAllSnakeCase: 'learning_path_resources'
 * }
 */
export function generateEntityNames(collectionName: string): EntityNames {
  const typeName = collectionNameToTypeName(collectionName);
  const typeNameCamelCase = pascalToCamel(typeName);
  const queryNameOne = pascalToSnake(typeName);
  const queryNameAll = typeNameCamelCase + 's';
  const queryNameAllSnakeCase = queryNameOne + 's';

  return {
    typeName,
    typeNamePascalCase: typeName, // Alias for backward compatibility
    typeNameCamelCase,
    queryNameOne,
    queryNameAll,
    queryNameAllSnakeCase
  };
}
