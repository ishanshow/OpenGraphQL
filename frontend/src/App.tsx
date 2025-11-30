import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import LandingPage from './components/LandingPage'
import MongoDBForm from './components/MongoDBForm'
import SQLForm from './components/SQLForm'
import RESTForm from './components/RESTForm'
import SuccessPage from './components/SuccessPage'
import './App.css'

export type DataSourceType = 'mongodb' | 'postgres' | 'mysql' | 'rest' | null
export type ViewState = 'landing' | 'form' | 'success'

export interface GenerationResult {
  serverUrl: string
  summary: string
}

function App() {
  const [currentView, setCurrentView] = useState<ViewState>('landing')
  const [selectedType, setSelectedType] = useState<DataSourceType>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)

  const handleSelectType = (type: DataSourceType) => {
    setSelectedType(type)
    setCurrentView('form')
  }

  const handleBack = () => {
    if (currentView === 'form') {
      setSelectedType(null)
      setCurrentView('landing')
    } else if (currentView === 'success') {
      setResult(null)
      setCurrentView('landing')
      setSelectedType(null)
    }
  }

  const handleSuccess = (generationResult: GenerationResult) => {
    setResult(generationResult)
    setCurrentView('success')
  }

  const renderForm = () => {
    switch (selectedType) {
      case 'mongodb':
        return <MongoDBForm onBack={handleBack} onSuccess={handleSuccess} />
      case 'postgres':
      case 'mysql':
        return <SQLForm type={selectedType} onBack={handleBack} onSuccess={handleSuccess} />
      case 'rest':
        return <RESTForm onBack={handleBack} onSuccess={handleSuccess} />
      default:
        return null
    }
  }

  return (
    <div className="app">
      <div className="grid-bg" />
      <div className="noise-overlay" />
      <div className="glow-orb glow-orb-1" />
      <div className="glow-orb glow-orb-2" />
      <div className="glow-orb glow-orb-3" />
      
      <main className="main-content">
        <AnimatePresence mode="wait">
          {currentView === 'landing' && (
            <LandingPage key="landing" onSelectType={handleSelectType} />
          )}
          {currentView === 'form' && (
            <div key="form">
              {renderForm()}
            </div>
          )}
          {currentView === 'success' && result && (
            <SuccessPage 
              key="success" 
              serverUrl={result.serverUrl} 
              summary={result.summary}
              onBack={handleBack}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App


