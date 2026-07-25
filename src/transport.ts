/**
 * Chamber transport — carrying the broadcast.
 *
 * Transport is a pluggable hook, not a fixed dependency (ADR-0001). The durable
 * substrate is always the session repo: the Hansard is the ordered, attributable
 * source of truth, and slot claims commit there atomically.
 *
 * Transport carries only the **ephemeral nudge** — "a motion is live". A dropped
 * message loses nothing, because a peer that hears nothing falls back to reading
 * the repo. That property is what lets the default transport be git itself, with
 * no broker and nothing new to run.
 *
 * The design consequence worth stating plainly: **nothing here is authoritative.**
 * If this module and the Hansard disagree, the Hansard is right. A transport that
 * could decide anything would be a second source of truth, and a governance
 * framework with two records has none.
 *
 * Attribution: Steve Krisjanovs, Cordfuse
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseEnvelope, serializeEnvelope, type Envelope } from './envelope.ts';

/* -------------------------------------------------------------------------- */
/* Interface                                                                   */
/* -------------------------------------------------------------------------- */

export interface Transport {
  /** Implementation name, recorded in the Hansard header. */
  readonly name: string;
  /** Put a broadcast on the bus. */
  publish(envelope: Envelope): Promise<PublishResult>;
  /** Broadcasts visible to this peer, oldest first. */
  poll(sessionGuid: string): Promise<readonly Envelope[]>;
  /** Mark a broadcast consumed by this peer. Best-effort. */
  ack(envelope: Envelope, peer: string): Promise<void>;
}

export interface PublishResult {
  /** Where the broadcast landed — a path, subject, or id. */
  readonly ref: string;
  readonly delivered: boolean;
}

/* -------------------------------------------------------------------------- */
/* Git transport — the reference                                               */
/* -------------------------------------------------------------------------- */

export interface GitTransportOptions {
  /** Session repo root. */
  readonly dir: string;
  /**
   * Directory for broadcasts, relative to the repo.
   *
   * Under `.politik/` rather than at the root: broadcasts are engine plumbing,
   * not part of the governance record, and a reader browsing the repo should
   * not mistake a transient nudge for a Motion.
   */
  readonly channel?: string;
}

const BROADCAST = /^broadcast-(\d+)-([\w-]+)\.md$/;

/**
 * Git-based transport — zero infrastructure.
 *
 * The SCM repository that already *is* the session is also the bus. A broadcast
 * is a file; publishing is a commit; polling is a read. Latency is the poll and
 * commit cadence, which is entirely adequate for proceedings that deliberate in
 * minutes rather than milliseconds.
 *
 * Crosstalk is one such git-based transport; this is the plain-filesystem
 * reference that keeps the "git already built it" promise literal.
 */
export class GitTransport implements Transport {
  readonly name = 'git';

  readonly #dir: string;
  readonly #channel: string;
  /** Monotonic counter so two broadcasts in the same millisecond stay ordered. */
  #sequence = 0;

  constructor(options: GitTransportOptions) {
    this.#dir = options.dir;
    this.#channel = options.channel ?? join('.politik', 'broadcast');
  }

  get #channelDir(): string {
    return join(this.#dir, this.#channel);
  }

  /**
   * Publish a broadcast.
   *
   * The filename carries the sequence and session so ordering and routing need
   * no index — the directory listing is the queue. The caller commits; this
   * module writes, because committing is a governance act and belongs to the
   * layer that owns the record.
   */
  async publish(envelope: Envelope): Promise<PublishResult> {
    await mkdir(this.#channelDir, { recursive: true });
    this.#sequence += 1;
    const name = `broadcast-${String(this.#sequence).padStart(6, '0')}-${envelope.session_guid}.md`;
    const path = join(this.#channelDir, name);
    await writeFile(path, serializeEnvelope(envelope), 'utf8');
    return { ref: join(this.#channel, name), delivered: true };
  }

  /**
   * Read broadcasts for a session, oldest first.
   *
   * An unreadable or malformed broadcast is skipped rather than thrown. A peer
   * must never be stopped by a corrupt nudge: the repo is still readable, and
   * falling back to it is the whole reason transport is allowed to be lossy.
   */
  async poll(sessionGuid: string): Promise<readonly Envelope[]> {
    let names: string[];
    try {
      names = await readdir(this.#channelDir);
    } catch {
      return [];
    }

    const ordered = names
      .map((n) => ({ n, m: BROADCAST.exec(n) }))
      .filter((x): x is { n: string; m: RegExpExecArray } => x.m !== null)
      .filter((x) => x.m[2] === sessionGuid)
      .sort((a, b) => Number(a.m[1]) - Number(b.m[1]));

    const envelopes: Envelope[] = [];
    for (const { n } of ordered) {
      try {
        const source = await readFile(join(this.#channelDir, n), 'utf8');
        const parsed = parseEnvelope(source);
        if (parsed.ok) envelopes.push(parsed.envelope);
      } catch {
        continue;
      }
    }
    return envelopes;
  }

  /**
   * Record that a peer consumed a broadcast.
   *
   * Advisory only. Acks help an operator see who heard what; they never gate
   * participation, because a peer that never acked may still have done the work
   * and committed it — and the Hansard, not the ack, is the evidence.
   */
  async ack(envelope: Envelope, peer: string): Promise<void> {
    const dir = join(this.#channelDir, 'acks');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${envelope.session_guid}-${peer}.ack`),
      `${envelope.session_guid} ${peer}\n`,
      'utf8',
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Null transport                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A transport that carries nothing.
 *
 * Not a stub for tests — a legitimate configuration. A single-machine session
 * whose runner is invoked directly needs no bus at all, and the architecture's
 * claim that a dropped broadcast loses nothing has to hold when *every*
 * broadcast is dropped. If a session cannot run over this transport, something
 * has quietly become dependent on the nudge.
 */
export class NullTransport implements Transport {
  readonly name = 'none';

  async publish(): Promise<PublishResult> {
    return { ref: 'none', delivered: false };
  }

  async poll(): Promise<readonly Envelope[]> {
    return [];
  }

  async ack(): Promise<void> {
    // Nothing to record.
  }
}
