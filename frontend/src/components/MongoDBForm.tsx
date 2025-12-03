import { useState } from 'react'
import { motion } from 'framer-motion'
import type { GenerationResult } from '../App'
import './shared/FormStyles.css'
import './MongoDBForm.css'

interface MongoDBFormProps {
  onBack: () => void
  onSuccess: (result: GenerationResult) => void
}

type Step = 'connect' | 'database' | 'collections' | 'generate'

const pageVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

export default function MongoDBForm({ onBack, onSuccess }: MongoDBFormProps) {
  const [step, setStep] = useState<Step>('connect')
  const [uri, setUri] = useState('')
  const [databases, setDatabases] = useState<string[]>([])
  const [selectedDatabase, setSelectedDatabase] = useState('')
  const [collections, setCollections] = useState<string[]>([])
  const [selectedCollections, setSelectedCollections] = useState<string[]>([])
  const [smartScan, setSmartScan] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const testConnection = async () => {
    setLoading(true)
    setError('')
    setStatus('')
    
    try {
      const response = await fetch('/api/mongodb/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
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
      const response = await fetch('/api/mongodb/list-databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
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
      const response = await fetch('/api/mongodb/list-collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri, database: db }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setCollections(data.collections)
        setStep('collections')
      } else {
        setError(data.message || 'Failed to list collections')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to list collections')
    } finally {
      setLoading(false)
    }
  }

  const toggleCollection = (collection: string) => {
    setSelectedCollections(prev => 
      prev.includes(collection)
        ? prev.filter(c => c !== collection)
        : [...prev, collection]
    )
  }

  const selectAllCollections = () => {
    if (selectedCollections.length === collections.length) {
      setSelectedCollections([])
    } else {
      setSelectedCollections([...collections])
    }
  }

  const generateSubgraph = async () => {
    setLoading(true)
    setError('')
    setStep('generate')
    
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'mongodb',
          config: {
            uri,
            database: selectedDatabase,
            collections: selectedCollections.length > 0 ? selectedCollections : undefined,
            name: 'mongodb',
            smartScan,
          },
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        onSuccess({
          serverUrl: data.serverUrl,
          summary: data.summary,
        })
      } else {
        setError(data.message || 'Failed to generate subgraph')
        setStep('collections')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate subgraph')
      setStep('collections')
    } finally {
      setLoading(false)
    }
  }

  const getStepNumber = (s: Step): number => {
    const steps: Step[] = ['connect', 'database', 'collections', 'generate']
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
      className="form-container mongodb-form"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="form-header">
        <button className="back-button" onClick={onBack}>
          ←
        </button>
        <h2 className="form-title">MongoDB Connection</h2>
      </div>

      <div className="progress-steps">
        <div className={`step ${isStepCompleted('connect') ? 'completed' : ''} ${isStepActive('connect') ? 'active' : ''}`}>
          <div className="step-number">{isStepCompleted('connect') ? '✓' : '1'}</div>
          <span className="step-label">Connect</span>
        </div>
        <div className={`step ${isStepCompleted('database') ? 'completed' : ''} ${isStepActive('database') ? 'active' : ''}`}>
          <div className="step-number">{isStepCompleted('database') ? '✓' : '2'}</div>
          <span className="step-label">Database</span>
        </div>
        <div className={`step ${isStepCompleted('collections') ? 'completed' : ''} ${isStepActive('collections') ? 'active' : ''}`}>
          <div className="step-number">{isStepCompleted('collections') ? '✓' : '3'}</div>
          <span className="step-label">Collections</span>
        </div>
        <div className={`step ${isStepCompleted('generate') ? 'completed' : ''} ${isStepActive('generate') ? 'active' : ''}`}>
          <div className="step-number">{isStepCompleted('generate') ? '✓' : '4'}</div>
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

      {step === 'connect' && (
        <div className="form-section">
          <div className="form-group">
            <label className="form-label" htmlFor="mongodb-uri">
              MongoDB URI
            </label>
            <input
              id="mongodb-uri"
              type="text"
              className="form-input"
              placeholder="mongodb://localhost:27017 or mongodb+srv://..."
              value={uri}
              onChange={(e) => setUri(e.target.value)}
            />
            <p className="form-hint">
              Enter your MongoDB connection string. Supports both standard and SRV formats.
            </p>
          </div>

          <button
            className="btn btn-primary btn-full"
            onClick={testConnection}
            disabled={!uri || loading}
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
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

      {step === 'collections' && (
        <div className="form-section">
          <div className="section-header">
            <h3 className="form-section-title">Select Collections</h3>
            <button
              className="btn btn-secondary select-all-btn"
              onClick={selectAllCollections}
            >
              {selectedCollections.length === collections.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="selection-list">
            {collections.length === 0 ? (
              <div className="empty-state">No collections found in {selectedDatabase}</div>
            ) : (
              collections.map(col => (
                <label
                  key={col}
                  className={`selection-item ${selectedCollections.includes(col) ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="selection-checkbox"
                    checked={selectedCollections.includes(col)}
                    onChange={() => toggleCollection(col)}
                  />
                  <span className="selection-label">{col}</span>
                </label>
              ))
            )}
          </div>
          <p className="form-hint">
            Select specific collections or leave empty to include all collections.
          </p>

          <div className="smart-scan-toggle">
            <div className="toggle-info">
              <span className="toggle-label">Smart Scan</span>
              <span className="toggle-hint">
                Progressive sampling for better field discovery in schemaless collections
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={smartScan}
                onChange={() => setSmartScan(!smartScan)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

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
          <div className="generating-spinner"></div>
          <h3>Generating Subgraph</h3>
          <p>Introspecting collections and building GraphQL schema...</p>
        </div>
      )}
    </motion.div>
  )
}


