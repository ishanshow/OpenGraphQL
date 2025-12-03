import { useState } from 'react'
import { motion } from 'framer-motion'
import type { GenerationResult } from '../App'
import './shared/FormStyles.css'
import './SQLForm.css'

interface SQLFormProps {
  type: 'postgres' | 'mysql'
  onBack: () => void
  onSuccess: (result: GenerationResult) => void
}

type SQLType = 'postgres' | 'mysql'
type Step = 'type' | 'connect' | 'database' | 'tables' | 'generate'

const pageVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

export default function SQLForm({ type: initialType, onBack, onSuccess }: SQLFormProps) {
  const [sqlType, setSqlType] = useState<SQLType>(initialType)
  const [step, setStep] = useState<Step>('type')
  
  // Connection fields
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState(sqlType === 'postgres' ? '5432' : '3306')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [ssl, setSsl] = useState(true)
  const [schema, setSchema] = useState('public')
  
  // Selection state
  const [databases, setDatabases] = useState<string[]>([])
  const [selectedDatabase, setSelectedDatabase] = useState('')
  const [tables, setTables] = useState<string[]>([])
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  
  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const handleTypeSelect = (type: SQLType) => {
    setSqlType(type)
    setPort(type === 'postgres' ? '5432' : '3306')
    setStep('connect')
  }

  const testConnection = async () => {
    setLoading(true)
    setError('')
    setStatus('')
    
    try {
      const endpoint = sqlType === 'postgres' ? '/api/postgres/test-connection' : '/api/mysql/test-connection'
      const systemDatabase = sqlType === 'postgres' ? 'postgres' : 'mysql'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, user, password, ssl, database: systemDatabase }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setStatus('Connection successful!')
        await fetchDatabases()
      } else {
        setError(data.message || 'Connection failed')
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  const fetchDatabases = async () => {
    setLoading(true)
    try {
      const endpoint = sqlType === 'postgres' ? '/api/postgres/list-databases' : '/api/mysql/list-databases'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, user, password, ssl }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setDatabases(data.databases)
        setStep('database')
      } else {
        setError(data.message || 'Failed to list databases')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to list databases')
    } finally {
      setLoading(false)
    }
  }

  const selectDatabase = async (db: string) => {
    setSelectedDatabase(db)
    setLoading(true)
    setError('')
    
    try {
      const endpoint = sqlType === 'postgres' ? '/api/postgres/list-tables' : '/api/mysql/list-tables'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, database: db, user, password, ssl, schema }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setTables(data.tables)
        setStep('tables')
      } else {
        setError(data.message || 'Failed to list tables')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to list tables')
    } finally {
      setLoading(false)
    }
  }

  const toggleTable = (table: string) => {
    setSelectedTables(prev => 
      prev.includes(table)
        ? prev.filter(t => t !== table)
        : [...prev, table]
    )
  }

  const selectAllTables = () => {
    if (selectedTables.length === tables.length) {
      setSelectedTables([])
    } else {
      setSelectedTables([...tables])
    }
  }

  const generateSubgraph = async () => {
    setLoading(true)
    setError('')
    setStep('generate')
    
    try {
      const config = sqlType === 'postgres' ? {
        host,
        port: parseInt(port),
        database: selectedDatabase,
        user,
        password,
        ssl,
        schema,
        tables: selectedTables.length > 0 ? selectedTables : undefined,
        name: 'postgres',
      } : {
        host,
        port: parseInt(port),
        database: selectedDatabase,
        user,
        password,
        tables: selectedTables.length > 0 ? selectedTables : undefined,
        name: 'mysql',
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: sqlType, config }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        onSuccess({
          serverUrl: data.serverUrl,
          summary: data.summary,
        })
      } else {
        setError(data.message || 'Failed to generate subgraph')
        setStep('tables')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate subgraph')
      setStep('tables')
    } finally {
      setLoading(false)
    }
  }

  const getStepNumber = (s: Step): number => {
    const steps: Step[] = ['type', 'connect', 'database', 'tables', 'generate']
    return steps.indexOf(s) + 1
  }

  const isStepCompleted = (s: Step): boolean => {
    return getStepNumber(s) < getStepNumber(step)
  }

  const isStepActive = (s: Step): boolean => {
    return s === step
  }

  return (
    <motion.div
      className={`form-container sql-form ${sqlType}`}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="form-header">
        <button className="back-button" onClick={onBack}>
          ←
        </button>
        <h2 className="form-title">SQL Database Connection</h2>
      </div>

      <div className="progress-steps">
        <div className={`step ${isStepCompleted('type') ? 'completed' : ''} ${isStepActive('type') ? 'active' : ''}`}>
          <div className="step-number">{isStepCompleted('type') ? '✓' : '1'}</div>
          <span className="step-label">Type</span>
        </div>
        <div className={`step ${isStepCompleted('connect') ? 'completed' : ''} ${isStepActive('connect') ? 'active' : ''}`}>
          <div className="step-number">{isStepCompleted('connect') ? '✓' : '2'}</div>
          <span className="step-label">Connect</span>
        </div>
        <div className={`step ${isStepCompleted('database') ? 'completed' : ''} ${isStepActive('database') ? 'active' : ''}`}>
          <div className="step-number">{isStepCompleted('database') ? '✓' : '3'}</div>
          <span className="step-label">Database</span>
        </div>
        <div className={`step ${isStepCompleted('tables') ? 'completed' : ''} ${isStepActive('tables') ? 'active' : ''}`}>
          <div className="step-number">{isStepCompleted('tables') ? '✓' : '4'}</div>
          <span className="step-label">Tables</span>
        </div>
        <div className={`step ${isStepCompleted('generate') ? 'completed' : ''} ${isStepActive('generate') ? 'active' : ''}`}>
          <div className="step-number">{isStepCompleted('generate') ? '✓' : '5'}</div>
          <span className="step-label">Generate</span>
        </div>
      </div>

      {error && (
        <div className="status-message status-error">
          <span>⚠</span> {error}
        </div>
      )}

      {status && !error && (
        <div className="status-message status-success">
          <span>✓</span> {status}
        </div>
      )}

      {step === 'type' && (
        <div className="form-section">
          <h3 className="form-section-title">Select Database Type</h3>
          <div className="sql-type-selector">
            <button
              className={`sql-type-btn ${sqlType === 'postgres' ? 'active' : ''}`}
              onClick={() => handleTypeSelect('postgres')}
            >
              <div className="sql-icon postgres-icon">🐘</div>
              <h3>PostgreSQL</h3>
              <p>Open-source relational database</p>
            </button>
            <button
              className={`sql-type-btn ${sqlType === 'mysql' ? 'active' : ''}`}
              onClick={() => handleTypeSelect('mysql')}
            >
              <div className="sql-icon mysql-icon">🐬</div>
              <h3>MySQL</h3>
              <p>Popular open-source RDBMS</p>
            </button>
          </div>
        </div>
      )}

      {step === 'connect' && (
        <div className="form-section">
          <div className="selected-type-badge">
            {sqlType === 'postgres' ? '🐘 PostgreSQL' : '🐬 MySQL'}
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="host">Host</label>
              <input
                id="host"
                type="text"
                className="form-input"
                placeholder="localhost"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="port">Port</label>
              <input
                id="port"
                type="text"
                className="form-input"
                placeholder={sqlType === 'postgres' ? '5432' : '3306'}
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="user">Username</label>
              <input
                id="user"
                type="text"
                className="form-input"
                placeholder="username"
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {sqlType === 'postgres' && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="schema">Schema</label>
                <input
                  id="schema"
                  type="text"
                  className="form-input"
                  placeholder="public"
                  value={schema}
                  onChange={(e) => setSchema(e.target.value)}
                />
              </div>
              
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={ssl}
                    onChange={(e) => setSsl(e.target.checked)}
                  />
                  <span>Enable SSL</span>
                </label>
              </div>
            </>
          )}

          <div className="form-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setStep('type')}
            >
              ← Back
            </button>
            <button
              className="btn btn-primary"
              onClick={testConnection}
              disabled={!host || !port || !user || loading}
            >
              {loading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {step === 'database' && (
        <div className="form-section">
          <h3 className="form-section-title">Select Database</h3>
          <div className="selection-list">
            {databases.length === 0 ? (
              <div className="empty-state">No databases found</div>
            ) : (
              databases.map(db => (
                <label
                  key={db}
                  className={`selection-item ${selectedDatabase === db ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    className="selection-radio"
                    name="database"
                    checked={selectedDatabase === db}
                    onChange={() => selectDatabase(db)}
                  />
                  <span className="selection-label">{db}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {step === 'tables' && (
        <div className="form-section">
          <div className="section-header">
            <h3 className="form-section-title">Select Tables</h3>
            <button
              className="btn btn-secondary select-all-btn"
              onClick={selectAllTables}
            >
              {selectedTables.length === tables.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="selection-list">
            {tables.length === 0 ? (
              <div className="empty-state">No tables found in {selectedDatabase}</div>
            ) : (
              tables.map(table => (
                <label
                  key={table}
                  className={`selection-item ${selectedTables.includes(table) ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="selection-checkbox"
                    checked={selectedTables.includes(table)}
                    onChange={() => toggleTable(table)}
                  />
                  <span className="selection-label">{table}</span>
                </label>
              ))
            )}
          </div>
          <p className="form-hint">
            Select specific tables or leave empty to include all tables.
          </p>

          <div className="form-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setStep('database')}
            >
              ← Back
            </button>
            <button
              className="btn btn-primary"
              onClick={generateSubgraph}
              disabled={loading}
            >
              {loading ? 'Generating...' : 'Generate Subgraph'}
            </button>
          </div>
        </div>
      )}

      {step === 'generate' && (
        <div className="generating-state">
          <div className={`generating-spinner ${sqlType}`}></div>
          <h3>Generating Subgraph</h3>
          <p>Introspecting tables and building GraphQL schema...</p>
        </div>
      )}
    </motion.div>
  )
}


