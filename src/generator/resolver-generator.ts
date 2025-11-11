import { BaseConnector } from '../connectors/base-connector';
import { IntrospectionResult } from '../types';
import { TypeMapper } from '../utils/type-mapper';
import { Logger } from '../utils/logger';
import { GraphQLError } from 'graphql';

export class ResolverGenerator {
  /**
   * Generates resolvers for all introspected entities
   */
  generateResolvers(
    introspectionResults: IntrospectionResult[],
    connectors: Map<string, BaseConnector>
  ): any {
    // Helper function for parsing GraphQL AST to JSON
    const parseLiteral = (ast: any): any => {
      switch (ast.kind) {
        case 'StringValue':
        case 'BooleanValue':
          return ast.value;
        case 'IntValue':
        case 'FloatValue':
          return parseFloat(ast.value);
        case 'ObjectValue':
          return ast.fields.reduce((obj: any, field: any) => {
            obj[field.name.value] = parseLiteral(field.value);
            return obj;
          }, {});
        case 'ListValue':
          return ast.values.map((v: any) => parseLiteral(v));
        default:
          return null;
      }
    };

    const resolvers: any = {
      Query: {},
      JSON: {
        __parseValue: (value: any) => value,
        __serialize: (value: any) => value,
        __parseLiteral: parseLiteral,
      },
    };

    // Generate resolvers for each entity
    for (const result of introspectionResults) {
      const connector = connectors.get(result.dataSourceName);
      if (!connector) {
        Logger.warning(`No connector found for data source: ${result.dataSourceName}`);
        continue;
      }

      for (const entity of result.entities) {
        // Generate list query resolver
        const listQueryName = this.generateListQueryName(entity.name, result.dataSourceName);
        resolvers.Query[listQueryName] = this.createListResolver(
          entity.name,
          connector,
          result.dataSourceName
        );

        // Generate single query resolver
        const singleQueryName = this.generateSingleQueryName(entity.name, result.dataSourceName);
        resolvers.Query[singleQueryName] = this.createSingleResolver(
          entity.name,
          connector,
          result.dataSourceName
        );

        // Add entity resolver for federation reference resolution
        if (!resolvers[entity.name]) {
          resolvers[entity.name] = {};
        }
        
        resolvers[entity.name].__resolveReference = this.createReferenceResolver(
          entity.name,
          connector
        );
      }
    }

    return resolvers;
  }

  /**
   * Creates a resolver for list queries
   */
  private createListResolver(
    entityName: string,
    connector: BaseConnector,
    dataSourceName: string
  ): any {
    return async (_parent: any, args: any, _context: any, _info: any) => {
      try {
        Logger.debug(`Resolving list query for ${entityName}`, args);
        
        const data = await connector.getData(entityName, {
          limit: args.limit || 100,
          offset: args.offset || 0,
          filter: args.filter,
        });

        return data;
      } catch (error) {
        Logger.error(`Error resolving ${entityName} list query`, error);
        throw new GraphQLError(`Failed to fetch ${entityName} from ${dataSourceName}`, {
          extensions: {
            code: 'DATA_SOURCE_ERROR',
            originalError: error,
          },
        });
      }
    };
  }

  /**
   * Creates a resolver for single item queries
   */
  private createSingleResolver(
    entityName: string,
    connector: BaseConnector,
    dataSourceName: string
  ): any {
    return async (_parent: any, args: any, _context: any, _info: any) => {
      try {
        // Get the key field name (id or _id)
        const keyField = this.findKeyFieldFromArgs(args);
        const id = args[keyField];

        Logger.debug(`Resolving single query for ${entityName}`, { keyField, id });

        if (!id) {
          throw new GraphQLError(`Missing ${keyField} argument`, {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        const data = await connector.getById(entityName, id);
        return data;
      } catch (error) {
        Logger.error(`Error resolving ${entityName} single query`, error);
        throw new GraphQLError(`Failed to fetch ${entityName} from ${dataSourceName}`, {
          extensions: {
            code: 'DATA_SOURCE_ERROR',
            originalError: error,
          },
        });
      }
    };
  }

  /**
   * Creates a resolver for federation reference resolution
   */
  private createReferenceResolver(entityName: string, connector: BaseConnector): any {
    return async (reference: any) => {
      try {
        // Reference should contain the key field
        const keyField = reference._id ? '_id' : 'id';
        const id = reference[keyField];

        if (!id) {
          Logger.warning(`No key field found in reference for ${entityName}`);
          return null;
        }

        Logger.debug(`Resolving reference for ${entityName}`, { keyField, id });

        const data = await connector.getById(entityName, id);
        return data;
      } catch (error) {
        Logger.error(`Error resolving reference for ${entityName}`, error);
        return null;
      }
    };
  }

  /**
   * Finds the key field from query arguments
   */
  private findKeyFieldFromArgs(args: any): string {
    if (args.id !== undefined) return 'id';
    if (args._id !== undefined) return '_id';
    
    // Return the first argument key as fallback
    const keys = Object.keys(args);
    return keys[0] || 'id';
  }

  /**
   * Generates a list query name
   */
  private generateListQueryName(entityName: string, dataSourceName: string): string {
    const singularCamel = TypeMapper.toCamelCase(entityName);
    const pluralName = TypeMapper.pluralize(singularCamel);
    const sanitizedDsName = TypeMapper.toCamelCase(dataSourceName);
    return `${sanitizedDsName}_${pluralName}`;
  }

  /**
   * Generates a single query name
   */
  private generateSingleQueryName(entityName: string, dataSourceName: string): string {
    const singularCamel = TypeMapper.toCamelCase(entityName);
    const sanitizedDsName = TypeMapper.toCamelCase(dataSourceName);
    return `${sanitizedDsName}_${singularCamel}`;
  }
}

