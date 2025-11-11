import { EntitySchema, FieldDefinition, IntrospectionResult } from '../types';
import { TypeMapper } from '../utils/type-mapper';

export class SchemaGenerator {
  private customScalars: Set<string> = new Set(['JSON']);

  /**
   * Generates GraphQL type definitions from introspection results
   */
  generateTypeDefs(introspectionResults: IntrospectionResult[]): string {
    const typeDefs: string[] = [];

    // Add custom scalars
    typeDefs.push(this.generateScalars());

    // Generate types for each entity
    for (const result of introspectionResults) {
      for (const entity of result.entities) {
        typeDefs.push(this.generateTypeDefinition(entity));
      }
    }

    // Generate Query type
    typeDefs.push(this.generateQueryType(introspectionResults));

    // Join all type definitions
    return typeDefs.join('\n\n');
  }

  /**
   * Generates custom scalar definitions
   */
  private generateScalars(): string {
    const scalars: string[] = [];

    for (const scalar of this.customScalars) {
      scalars.push(`scalar ${scalar}`);
    }

    return scalars.join('\n');
  }

  /**
   * Generates a GraphQL type definition for an entity
   */
  private generateTypeDefinition(entity: EntitySchema): string {
    const lines: string[] = [];

    // Add description if available
    if (entity.description) {
      lines.push(`"""${entity.description}"""`);
    }

    // Type declaration with @key directive for federation
    const keyField = this.findKeyField(entity);
    lines.push(`type ${entity.name} @key(fields: "${keyField}") {`);

    // Add fields
    for (const field of entity.fields) {
      lines.push(this.generateFieldDefinition(field, 2));
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Generates a field definition line
   */
  private generateFieldDefinition(field: FieldDefinition, indent: number = 0): string {
    const indentation = ' '.repeat(indent);
    const type = this.formatFieldType(field);
    
    let line = `${indentation}${field.name}: ${type}`;

    if (field.description) {
      line = `${indentation}"""${field.description}"""\n${line}`;
    }

    return line;
  }

  /**
   * Formats the GraphQL type for a field
   */
  private formatFieldType(field: FieldDefinition): string {
    let type = field.type;

    // Handle arrays
    if (field.isArray) {
      type = `[${type}]`;
    }

    // Handle non-nullable
    if (!field.isNullable) {
      type = `${type}!`;
    }

    return type;
  }

  /**
   * Generates the Query type with all available queries
   */
  private generateQueryType(introspectionResults: IntrospectionResult[]): string {
    const lines: string[] = [];

    lines.push('type Query {');

    for (const result of introspectionResults) {
      for (const entity of result.entities) {
        // Generate list query (e.g., users, products)
        const listQueryName = this.generateListQueryName(entity.name, result.dataSourceName);
        lines.push(
          `  """Fetch multiple ${entity.name} records from ${result.dataSourceName}"""`
        );
        lines.push(
          `  ${listQueryName}(limit: Int = 100, offset: Int = 0, filter: ${entity.name}Filter): [${entity.name}!]!`
        );

        // Generate single query (e.g., user, product)
        const singleQueryName = this.generateSingleQueryName(entity.name, result.dataSourceName);
        const keyField = this.findKeyField(entity);
        const keyFieldType = entity.fields.find(f => f.name === keyField)?.type || 'ID';
        lines.push(
          `  """Fetch a single ${entity.name} by ${keyField} from ${result.dataSourceName}"""`
        );
        lines.push(
          `  ${singleQueryName}(${keyField}: ${keyFieldType}!): ${entity.name}`
        );
      }
    }

    lines.push('}');

    // Generate input types for filters
    for (const result of introspectionResults) {
      for (const entity of result.entities) {
        lines.push('');
        lines.push(this.generateFilterInputType(entity));
      }
    }

    return lines.join('\n');
  }

  /**
   * Generates filter input type for queries
   */
  private generateFilterInputType(entity: EntitySchema): string {
    const lines: string[] = [];

    lines.push(`"""Filter input for ${entity.name}"""`);
    lines.push(`input ${entity.name}Filter {`);

    // Add filterable fields (exclude complex types)
    for (const field of entity.fields) {
      if (field.type !== 'JSON' && !field.isArray) {
        lines.push(`  ${field.name}: ${field.type}`);
      }
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Generates a list query name (e.g., mongodb_movies, postgres_products)
   */
  private generateListQueryName(entityName: string, dataSourceName: string): string {
    // EntityName is singular (e.g., "Movie"), convert to camelCase then pluralize
    const singularCamel = TypeMapper.toCamelCase(entityName);
    const pluralName = TypeMapper.pluralize(singularCamel);
    const sanitizedDsName = TypeMapper.toCamelCase(dataSourceName);
    return `${sanitizedDsName}_${pluralName}`;
  }

  /**
   * Generates a single query name (e.g., mongodb_movie, postgres_product)
   */
  private generateSingleQueryName(entityName: string, dataSourceName: string): string {
    // EntityName is singular (e.g., "Movie"), just convert to camelCase
    const singularCamel = TypeMapper.toCamelCase(entityName);
    const sanitizedDsName = TypeMapper.toCamelCase(dataSourceName);
    return `${sanitizedDsName}_${singularCamel}`;
  }

  /**
   * Finds the key field for federation (prefers id, _id, or first field)
   */
  private findKeyField(entity: EntitySchema): string {
    // Look for common ID fields
    for (const field of entity.fields) {
      if (field.name === 'id' || field.name === '_id') {
        return field.name;
      }
    }

    // Use the first field as fallback
    return entity.fields[0]?.name || 'id';
  }

  /**
   * Generates the complete federated schema with directives
   */
  generateFederatedSchema(introspectionResults: IntrospectionResult[]): string {
    const federationDirectives = `
extend schema
  @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@shareable"])
`.trim();

    const typeDefs = this.generateTypeDefs(introspectionResults);

    return `${federationDirectives}\n\n${typeDefs}`;
  }
}

