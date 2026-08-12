import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  allowsCharterAmendment,
  allowsEscalation,
  keepsRecord,
  parseProtocol,
  roleTerm,
  term,
  type Protocol,
} from '../src/protocol.ts';
import { ROLES } from '../src/canon.ts';
import {
  LABEL_TAXONOMY,
  charterTemplate,
  scaffoldTemplates,
  roleTemplates,
  orderPaperTemplate,
} from '../src/templates/parliamentary.ts';
import { parseCharter, validateCharter } from '../src/charter.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PARLIAMENTARY = readFileSync(
  join(here, '..', 'protocols', 'parliamentary.yml'),
  'utf8',
);
const parliamentaryProtocol: Protocol = (() => {
  const parsed = parseProtocol(PARLIAMENTARY);
  if (!parsed.ok) throw new Error('parliamentary.yml did not parse');
  return parsed.protocol;
})();

const parseOk = (source: string): Protocol => {
  const result = parseProtocol(source);
  assert.ok(result.ok, `expected parse to succeed: ${JSON.stringify(result)}`);
  return result.protocol;
};

describe('the shipped Parliamentary protocol', () => {
  const protocol = parseOk(PARLIAMENTARY);

  it('parses with no warnings — every CANON role is mapped', () => {
    const result = parseProtocol(PARLIAMENTARY);
    assert.ok(result.ok);
    assert.deepEqual(result.warnings, []);
  });

  it('is constitutional with a distributed record', () => {
    assert.equal(protocol.name, 'parliamentary');
    assert.equal(protocol.mode, 'constitutional');
    assert.equal(protocol.record_mode, 'distributed');
  });

  it('translates every CANON role', () => {
    assert.equal(roleTerm(protocol, 'AUTHORITY'), 'Speaker');
    assert.equal(roleTerm(protocol, 'DELEGATE'), 'Deputy Speaker');
    assert.equal(roleTerm(protocol, 'OPERATOR'), 'Minister');
    assert.equal(roleTerm(protocol, 'MEMBER'), 'Backbencher');
    assert.equal(roleTerm(protocol, 'OBSERVER'), 'Gallery');
  });

  it('translates primitives and verbs', () => {
    assert.equal(term(protocol, 'RECORD'), 'Hansard');
    assert.equal(term(protocol, 'ESCALATION'), 'Point of Order');
    assert.equal(term(protocol, 'ASSENT'), 'Royal Assent');
    // Parliamentary vocabulary, per PROTOCOLS.md — "Merge Conflict" is the
    // Agile term and was previously miscopied into this manifest.
    assert.equal(term(protocol, 'CONFLICT'), 'Competing Amendments');
    assert.equal(term(protocol, 'DEADLOCK'), 'Hung Parliament');
    assert.equal(term(protocol, 'SUSPENSION'), 'Adjournment');
  });

  it('permits escalation, keeps a record, allows amendment', () => {
    assert.ok(allowsEscalation(protocol));
    assert.ok(keepsRecord(protocol));
    assert.ok(allowsCharterAmendment(protocol));
  });

  it('grants no domain veto', () => {
    assert.deepEqual([...protocol.domain_veto], []);
  });
});

describe('translation fallback', () => {
  const minimal = parseOk(
    'protocol:\n  name: bare\n  mode: darwinist\n  record_mode: anchored\n',
  );

  it('falls back to the CANON term for unmapped roles', () => {
    for (const role of ROLES) {
      assert.equal(roleTerm(minimal, role), role);
    }
  });

  it('falls back to the CANON term for unmapped primitives', () => {
    assert.equal(term(minimal, 'DIVISION'), 'DIVISION');
  });

  it('warns about unmapped roles rather than refusing to load', () => {
    const result = parseProtocol('protocol:\n  name: bare\n  mode: darwinist\n  record_mode: anchored\n');
    assert.ok(result.ok);
    assert.equal(result.warnings.length, ROLES.length);
  });
});

describe('behavioural flags', () => {
  it('a darwinist protocol can forbid escalation', () => {
    const darwin = parseOk(
      'protocol:\n  name: battle-royale\n  mode: darwinist\n  record_mode: anchored\n  no_escalation: true\n',
    );
    assert.ok(!allowsEscalation(darwin));
  });

  it('an ephemeral protocol keeps no record', () => {
    const ephemeral = parseOk(
      'protocol:\n  name: intel\n  mode: ephemeral\n  record_mode: ephemeral\n  no_record: true\n',
    );
    assert.ok(!keepsRecord(ephemeral));
  });

  it('an immutable protocol forbids mid-session amendment', () => {
    const immutable = parseOk(
      'protocol:\n  name: aviation\n  mode: immutable\n  record_mode: anchored\n  immutable_charter: true\n',
    );
    assert.ok(!allowsCharterAmendment(immutable));
  });

  it('warns when an ephemeral record mode still claims to record', () => {
    const result = parseProtocol(
      'protocol:\n  name: x\n  mode: ephemeral\n  record_mode: ephemeral\n  no_record: false\n',
    );
    assert.ok(result.ok);
    assert.ok(result.warnings.some((w) => w.field === 'record_mode'));
  });
});

describe('rejection', () => {
  it('rejects malformed YAML', () => {
    const result = parseProtocol('protocol: [unclosed');
    assert.ok(!result.ok);
  });

  it('rejects a missing name', () => {
    const result = parseProtocol('protocol:\n  mode: constitutional\n  record_mode: anchored\n');
    assert.ok(!result.ok);
    assert.ok(result.issues.some((i) => i.field === 'name'));
  });

  it('rejects an unknown mode', () => {
    const result = parseProtocol('protocol:\n  name: x\n  mode: monarchy\n  record_mode: anchored\n');
    assert.ok(!result.ok);
    assert.ok(result.issues.some((i) => i.field === 'mode'));
  });

  it('rejects a role outside CANON', () => {
    const result = parseProtocol(
      'protocol:\n  name: x\n  mode: constitutional\n  record_mode: anchored\n  roles:\n    MINISTER: Minister\n',
    );
    assert.ok(!result.ok);
    assert.ok(result.issues.some((i) => i.field === 'roles.MINISTER'));
  });
});

describe('Parliamentary templates', () => {
  it('generates a Charter that passes Writ Drop validation', () => {
    const parsed = parseCharter(charterTemplate());
    assert.ok(parsed.ok, 'template Charter failed to parse');
    const result = validateCharter(parsed.charter, {
      name: 'parliamentary',
      record_mode: 'distributed',
    });
    assert.deepEqual(result.issues, [], 'template Charter failed validation');
  });

  it('avoids squash, which is invalid under a distributed record mode', () => {
    const parsed = parseCharter(charterTemplate());
    assert.ok(parsed.ok);
    assert.notEqual(parsed.charter.session.merge_strategy, 'squash');
  });

  it('honours a custom quorum', () => {
    const parsed = parseCharter(charterTemplate({ quorum: 5 }));
    assert.ok(parsed.ok);
    assert.equal(parsed.charter.session.quorum, 5);
  });

  it('satisfies its own minimum_cast', () => {
    const parsed = parseCharter(charterTemplate());
    assert.ok(parsed.ok);
    const result = validateCharter(parsed.charter);
    assert.ok(!result.issues.some((i) => i.rule === 3), 'template understaffs itself');
  });

  it('writes one role file per CANON role, each naming its mapping', () => {
    const files = roleTemplates(parliamentaryProtocol);
    assert.equal(files.length, ROLES.length);
    for (const role of ROLES) {
      assert.ok(
        files.some((f) => f.content.includes(`\`${role}\``)),
        `no role file maps ${role}`,
      );
    }
  });

  it('states that the Speaker must be human', () => {
    const speaker = roleTemplates(parliamentaryProtocol).find((f) => f.path.endsWith('speaker.md'));
    assert.match(speaker?.content ?? '', /Always human/);
  });

  it('bundles Charter, Order Paper and roles', () => {
    const files = scaffoldTemplates(parliamentaryProtocol);
    const paths = files.map((f) => f.path);
    assert.ok(paths.includes('CHARTER.md'));
    assert.ok(paths.includes('ORDER-PAPER.md'));
    assert.equal(paths.filter((p) => p.startsWith('roles/')).length, ROLES.length);
  });
});

describe('per-protocol scaffold templates', () => {
  const monarchy = parseOk(
    readFileSync(join(here, '..', 'protocols', 'monarchy.yml'), 'utf8'),
  );

  it('renders role docs in the protocol\'s own vocabulary, not parliamentary', () => {
    const files = roleTemplates(monarchy);
    const crown = files.find((f) => f.path === 'roles/the-crown.md');
    assert.ok(crown, 'no monarchy AUTHORITY role file');
    assert.match(crown.content, /`AUTHORITY`/);
    assert.match(crown.content, /Protocol:\*\* monarchy/);
    // and none of the parliamentary filenames leak in
    assert.ok(!files.some((f) => f.path === 'roles/speaker.md'));
    assert.ok(!files.some((f) => f.path === 'roles/minister.md'));
  });

  it('generates one role file per CANON role the protocol names', () => {
    const files = roleTemplates(monarchy);
    const named = Object.keys(monarchy.roles).length;
    assert.equal(files.length, named);
  });

  it('the Order Paper speaks the protocol vocabulary', () => {
    assert.match(orderPaperTemplate(monarchy), /Royal Court/); // SESSION term
    assert.match(orderPaperTemplate(monarchy), /Petition/); // MOTION term
  });

  it('parliamentary keeps its hand-written role prose', () => {
    const files = roleTemplates(parliamentaryProtocol);
    assert.ok(files.some((f) => f.path === 'roles/speaker.md'));
  });
});

describe('label taxonomy', () => {
  it('uses valid six-digit hex colours', () => {
    for (const label of LABEL_TAXONOMY) {
      assert.match(label.color, /^[0-9A-F]{6}$/, `${label.name} has a bad colour`);
    }
  });

  it('names distinct labels', () => {
    const names = new Set(LABEL_TAXONOMY.map((l) => l.name));
    assert.equal(names.size, LABEL_TAXONOMY.length);
  });

  it('states the CANON primitive each label maps to', () => {
    const motion = LABEL_TAXONOMY.find((l) => l.name === 'motion');
    assert.match(motion?.description ?? '', /MOTION/);
    const poo = LABEL_TAXONOMY.find((l) => l.name === 'point-of-order');
    assert.match(poo?.description ?? '', /ESCALATION/);
  });

  it('carries the label the escalation workflow files against', () => {
    assert.ok(LABEL_TAXONOMY.some((l) => l.name === 'point-of-order'));
  });
});
