import { motion } from 'framer-motion'
import type { DataSourceType } from '../App'
import './LandingPage.css'

interface LandingPageProps {
  onSelectType: (type: DataSourceType) => void
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
  exit: { opacity: 0, transition: { duration: 0.2 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: 'spring', stiffness: 100, damping: 15 }
  },
  hover: { 
    y: -8,
    transition: { type: 'spring', stiffness: 400, damping: 10 }
  },
}

export default function LandingPage({ onSelectType }: LandingPageProps) {
  return (
    <motion.div
      className="landing-page"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div className="landing-header" variants={itemVariants}>
        <div className="logo-container">
          <div className="logo-icon">
            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="32" cy="32" r="28" stroke="url(#gradient1)" strokeWidth="2" />
              <path d="M32 12L32 52" stroke="url(#gradient1)" strokeWidth="2" />
              <path d="M20 22L32 32L20 42" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M44 22L32 32L44 42" stroke="var(--accent-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="32" cy="32" r="4" fill="var(--accent-primary)" />
              <defs>
                <linearGradient id="gradient1" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                  <stop stopColor="var(--accent-primary)" />
                  <stop offset="0.5" stopColor="var(--accent-secondary)" />
                  <stop offset="1" stopColor="var(--accent-tertiary)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="logo-text">
            Open<span className="gradient-text">GraphQL</span>
          </h1>
        </div>
        <p className="landing-subtitle">
          Transform your data sources into powerful Apollo GraphQL subgraphs
        </p>
      </motion.div>

      <motion.div className="cards-container" variants={itemVariants}>
        <motion.button
          className="datasource-card mongodb"
          variants={cardVariants}
          whileHover="hover"
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelectType('mongodb')}
        >
          <div className="card-icon">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 4C24 4 24 20 24 28C24 36 24 44 24 44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <path d="M24 28C18 28 12 24 12 16C12 8 18 4 24 4C30 4 36 8 36 16C36 24 30 28 24 28Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2" />
              <path d="M20 44C20 44 20 36 24 36C28 36 28 44 28 44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="card-title">MongoDB</h2>
          <p className="card-description">
            Connect to MongoDB databases and auto-generate GraphQL schemas from your collections
          </p>
          <div className="card-arrow">→</div>
        </motion.button>

        <motion.button
          className="datasource-card sql"
          variants={cardVariants}
          whileHover="hover"
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelectType('postgres')}
        >
          <div className="card-icon">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="24" cy="12" rx="16" ry="6" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2" />
              <path d="M8 12V24C8 27.3137 15.1634 30 24 30C32.8366 30 40 27.3137 40 24V12" stroke="currentColor" strokeWidth="2" />
              <path d="M8 24V36C8 39.3137 15.1634 42 24 42C32.8366 42 40 39.3137 40 36V24" stroke="currentColor" strokeWidth="2" />
              <ellipse cx="24" cy="24" rx="16" ry="6" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
          </div>
          <h2 className="card-title">SQL</h2>
          <p className="card-description">
            Support for PostgreSQL and MySQL databases with automatic table introspection
          </p>
          <div className="card-arrow">→</div>
        </motion.button>

        <motion.button
          className="datasource-card rest"
          variants={cardVariants}
          whileHover="hover"
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelectType('rest')}
        >
          <div className="card-icon">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="14" width="16" height="20" rx="2" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2" />
              <rect x="26" y="14" width="16" height="20" rx="2" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2" />
              <path d="M22 24H26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M22 20L26 24L22 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="14" cy="20" r="2" fill="currentColor" />
              <circle cx="34" cy="28" r="2" fill="currentColor" />
            </svg>
          </div>
          <h2 className="card-title">REST API</h2>
          <p className="card-description">
            Wrap existing REST endpoints and transform them into a unified GraphQL interface
          </p>
          <div className="card-arrow">→</div>
        </motion.button>
      </motion.div>

      <motion.p className="landing-footer" variants={itemVariants}>
        Select a data source to begin generating your Apollo subgraph
      </motion.p>
    </motion.div>
  )
}


