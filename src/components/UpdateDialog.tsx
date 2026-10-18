import { RefreshCw } from 'lucide-react';
import { Modal } from './ui';
import { UpdateAction } from './UpdateAction';
import type { Release } from '../types';

export function UpdateDialog({ release, onLater }: { release: Release; onLater: () => void }) {
  const notes = release.notes
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean);
  return (
    <Modal title="小花园有了新变化" onClose={onLater}>
      <section className="update-dialog-content">
        <div className="update-release-heading">
          <span className="update-release-icon">
            <RefreshCw size={25} />
          </span>
          <div>
            <h3>MuMu Flowers {release.version}</h3>
            <p>发现新版本，可以更新了</p>
          </div>
        </div>
        <h4>本次更新</h4>
        <ul className="update-release-notes">
          {notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
        <UpdateAction key={release.version} release={release} later={onLater} />
      </section>
    </Modal>
  );
}
