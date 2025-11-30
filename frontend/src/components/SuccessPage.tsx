import { motion } from 'framer-motion'
import './shared/FormStyles.css'
import './SuccessPage.css'

interface SuccessPageProps {
  serverUrl: string
  summary: string
  onBack: () => void
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
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

export default function SuccessPage({ serverUrl, summary, onBack }: SuccessPageProps) {
  const openGraphQL = () => {
    window.open(serverUrl, '_blank')
  }

  return (
    <motion.div
      className="success-page"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div className="success-header" variants={itemVariants}>
        <div className="success-icon">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="28" stroke="url(#successGradient)" strokeWidth="3" />
            <path
              d="M20 32L28 40L44 24"
              stroke="var(--accent-primary)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="successGradient" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
                <stop stopColor="var(--accent-primary)" />
                <stop offset="1" stopColor="var(--accent-secondary)" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 className="success-title">Subgraph Generated!</h1>
        <p className="success-subtitle">
          Your Apollo GraphQL subgraph is ready and running
        </p>
      </motion.div>

      <motion.div className="success-card" variants={itemVariants}>
        <div className="server-url-section">
          <span className="section-label">GraphQL Endpoint</span>
          <div className="url-display">
            <code>{serverUrl}</code>
            <button
              className="copy-btn"
              onClick={() => navigator.clipboard.writeText(serverUrl)}
              title="Copy URL"
            >
              📋
            </button>
          </div>
        </div>

        <motion.button
          className="open-graphql-btn"
          onClick={openGraphQL}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="btn-icon">🚀</span>
          Open Apollo Sandbox
          <span className="btn-arrow">→</span>
        </motion.button>

        <p className="sandbox-hint">
          Explore your schema and run queries in the interactive GraphQL playground
        </p>
      </motion.div>

      <motion.div className="summary-section" variants={itemVariants}>
        <h3 className="summary-title">Generation Summary</h3>
        <pre className="summary-content">{summary}</pre>
      </motion.div>

      <motion.div className="actions-section" variants={itemVariants}>
        <button className="btn btn-secondary" onClick={onBack}>
          ← Generate Another
        </button>
      </motion.div>

      <motion.div className="features-grid" variants={itemVariants}>
        <div className="feature-card">
          <div className="feature-icon">📊</div>
          <h4>Introspection</h4>
          <p>Full GraphQL introspection enabled for schema exploration</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🔄</div>
          <h4>Federation Ready</h4>
          <p>Built as an Apollo Federation subgraph for easy composition</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <h4>Auto Resolvers</h4>
          <p>Dynamic resolvers generated from your data source schema</p>
        </div>
      </motion.div>
    </motion.div>
  )
}


