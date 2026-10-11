import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { MotionConfig } from 'framer-motion';
import './styles.css';
import './navigation.css';
import './watering.css';
import './refinements.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
      <App />
    </MotionConfig>
  </React.StrictMode>,
);
