// Rolling snapshots of the store: what the app imports. The store holds them as `store.snapshots`;
// the snapshotter decides when; the signals say how safe the data is.

export type { RiskyReason, RestorePreview, SnapshotInfo, SnapshotKind, SnapshotReason, TableDiff } from './types';
export { SnapshotError, type SnapshotRefusal, type Snapshots } from './snapshots';
export { browserSnapshotEnv, createSnapshotter, type Snapshotter, type SnapshotterEnv } from './scheduler';
export { DEFAULT_SNAPSHOT_POLICY, isRiskyEdit, type SnapshotPolicy } from './policy';
export { DEFAULT_RETENTION, type Retained, type RetentionPolicy } from './retention';
export { backupSignals, DEFAULT_THRESHOLDS, type BackupSignals, type Severity, type SignalInput, type SignalReason, type Thresholds } from './signals';
