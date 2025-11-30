import { useState } from 'react'
import { motion } from 'framer-motion'
import type { GenerationResult } from '../App'
import './shared/FormStyles.css'
import './RESTForm.css'

interface RESTFormProps {
  onBack: () => void
  onSuccess: (result: GenerationResult) => void
}

interface RESTEndpoint {
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  queryName: string
}

const pageVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

export default function RESTForm({ onBack, onSuccess }: RESTFormProps) {
  const [baseUrl, setBaseUrl] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [endpoints, setEndpoints] = useState<RESTEndpoint[]>([
    { path: '', method: 'GET', queryName: '' }
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [generating, setGenerating] = useState(false)

  const addEndpoint = () => {
    setEndpoints([...endpoints, { path: '', method: 'GET', queryName: '' }])
  }

  const removeEndpoint = (index: number) => {
    if (endpoints.length > 1) {
      setEndpoints(endpoints.filter((_, i) => i !== index))
    }
  }

  const updateEndpoint = (index: number, field: keyof RESTEndpoint, value: string) => {
    const updated = [...endpoints]
    updated[index] = { ...updated[index], [field]: value }
    setEndpoints(updated)
  }

  const testConnection = async () => {
    setLoading(true)
    setError('')
    setStatus('')
    
    try {
      const response = await fetch('/api/rest/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, authToken }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        setStatus('Connection successful! Base URL is reachable.')
      } else {
        setError(data.message || 'Connection failed')
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  const generateSubgraph = async () => {
    // Validate endpoints
    const validEndpoints = endpoints.filter(e => e.path && e.queryName)
    if (validEndpoints.length === 0) {
      setError('Please add at least one endpoint with path and query name')
      return
    }

    setLoading(true)
    setError('')
    setGenerating(true)
    
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'rest',
          config: {
            baseUrl,
            authToken: authToken || undefined,
            endpoints: validEndpoints,
            name: 'rest',
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
        setGenerating(false)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate subgraph')
      setGenerating(false)
    } finally {
      setLoading(false)
    }
  }

  if (generating) {
    return (
      <motion.div
        className="form-container rest-form"
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <div className="generating-state">
          <div className="generating-spinner"></div>
          <h3>Generating Subgraph</h3>
          <p>Introspecting REST endpoints and building GraphQL schema...</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="form-container rest-form"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="form-header">
        <button className="back-button" onClick={onBack}>
          ←
        </button>
        <h2 className="form-title">REST API Configuration</h2>
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

      <div className="form-section">
        <h3 className="form-section-title">Base Configuration</h3>
        
        <div className="form-group">
          <label className="form-label" htmlFor="baseUrl">Base URL</label>
          <input
            id="baseUrl"
            type="text"
            className="form-input"
            placeholder="https://api.example.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <p className="form-hint">The base URL for all API endpoints</p>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="authToken">
            Auth Token <span className="optional">(Optional)</span>
          </label>
          <input
            id="authToken"
            type="password"
            className="form-input"
            placeholder="Bearer token or API key"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
          />
          <p className="form-hint">Will be sent as Authorization: Bearer header</p>
        </div>

        <button
          className="btn btn-secondary"
          onClick={testConnection}
          disabled={!baseUrl || loading}
        >
          {loading ? 'Testing...' : 'Test Connection'}
        </button>
      </div>

      <div className="form-section">
        <div className="section-header">
          <h3 className="form-section-title">Endpoints</h3>
          <button className="btn btn-secondary add-endpoint-btn" onClick={addEndpoint}>
            + Add Endpoint
          </button>
        </div>

        <div className="endpoints-list">
          {endpoints.map((endpoint, index) => (
            <div key={index} className="endpoint-card">
              <div className="endpoint-header">
                <span className="endpoint-number">#{index + 1}</span>
                {endpoints.length > 1 && (
                  <button
                    className="remove-endpoint-btn"
                    onClick={() => removeEndpoint(index)}
                  >
                    ×
                  </button>
                )}
              </div>
              
              <div className="endpoint-fields">
                <div className="form-group method-group">
                  <label className="form-label">Method</label>
                  <select
                    className="form-input method-select"
                    value={endpoint.method}
                    onChange={(e) => updateEndpoint(index, 'method', e.target.value)}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>

                <div className="form-group path-group">
                  <label className="form-label">Path</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="/users"
                    value={endpoint.path}
                    onChange={(e) => updateEndpoint(index, 'path', e.target.value)}
                  />
                </div>

                <div className="form-group query-group">
                  <label className="form-label">Query Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="getUsers"
                    value={endpoint.queryName}
                    onChange={(e) => updateEndpoint(index, 'queryName', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <p className="form-hint">
          Each endpoint will be exposed as a GraphQL query. The response structure will be automatically introspected.
        </p>
      </div>

      <div className="form-actions">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button
          className="btn btn-primary"
          onClick={generateSubgraph}
          disabled={!baseUrl || loading}
        >
          {loading ? 'Generating...' : 'Generate Subgraph'}
        </button>
      </div>
    </motion.div>
  )
}


