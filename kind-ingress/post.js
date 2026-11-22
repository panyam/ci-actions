const gha = require('../lib/gha');

const SYSTEM = new Set(['kube-system', 'local-path-storage']);

gha.main(() => {
  const kind = gha.getState('kind');
  const name = gha.getState('name');
  if (!kind || !name) return;

  // A post step can't tell whether the job failed, so the dump always goes in a collapsed group.
  gha.group('kind-ingress: pods, events and logs', () => {
    gha.run('kubectl', ['get', 'pods', '-A', '-o', 'wide'], { allowFail: true });
    gha.run('kubectl', ['get', 'events', '-A', '--sort-by=.lastTimestamp'], { allowFail: true });
    let pods = [];
    try {
      pods = JSON.parse(gha.capture('kubectl', ['get', 'pods', '-A', '-o', 'json'])).items;
    } catch (e) {
      console.log(`no pods to dump: ${e.message}`);
    }
    for (const p of pods) {
      const { namespace, name: pod } = p.metadata;
      if (SYSTEM.has(namespace)) continue;
      console.log(`--- ${namespace}/${pod}`);
      gha.run('kubectl', ['logs', '-n', namespace, pod, '--all-containers', '--prefix', '--tail', '500'], { allowFail: true });
    }
  });
  gha.run(kind, ['delete', 'cluster', '--name', name], { allowFail: true });
});
