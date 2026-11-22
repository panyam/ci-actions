const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const gha = require('../lib/gha');

const KIND_VERSION = 'v0.33.0';
const KIND_SHA256 = {
  amd64: 'aee6151561422756b764a4ae28e7f44cda5af5a9eead3cc9985112b1de8d8e0d',
  arm64: '20022bee6cfcd5086cb7234d218e3454e6090022f2a8f55d1fa7fcf42c3867a2',
};
// ingress-nginx's last release. The project was archived in March 2026; the ingress-manifest input
// swaps in another controller.
const INGRESS_MANIFEST = 'https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/kind/deploy.yaml';
const INGRESS_SHA256 = '2a3ae008c8786431115502644e77ab398fdebfb721a5d1195ed3089cde3299df';

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function download(url, dest, want) {
  gha.run('curl', ['-fsSL', '--retry', '3', '-o', dest, url]);
  if (want && sha256(dest) !== want) throw new Error(`${url} has sha256 ${sha256(dest)}, want ${want}`);
}

function installKind(dir) {
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (process.platform !== 'linux' || !arch) throw new Error(`kind-ingress runs on Linux x64 or arm64, not ${process.platform}/${process.arch}`);
  const bin = path.join(dir, 'kind');
  download(`https://github.com/kubernetes-sigs/kind/releases/download/${KIND_VERSION}/kind-linux-${arch}`, bin, KIND_SHA256[arch]);
  fs.chmodSync(bin, 0o755);
  return bin;
}

// The node label is what ingress-nginx's kind manifest selects to schedule its controller next to
// the mapped ports.
function clusterConfig() {
  return [
    'kind: Cluster',
    'apiVersion: kind.x-k8s.io/v1alpha4',
    'nodes:',
    '  - role: control-plane',
    '    labels:',
    '      ingress-ready: "true"',
    '    extraPortMappings:',
    '      - { containerPort: 80, hostPort: 80, protocol: TCP }',
    '      - { containerPort: 443, hostPort: 443, protocol: TCP }',
    '',
  ].join('\n');
}

// gateway is the kind network's IPv4 gateway, the runner's address as pods see it.
function gateway() {
  const configs = JSON.parse(gha.capture('docker', ['network', 'inspect', 'kind', '--format', '{{json .IPAM.Config}}']));
  const v4 = configs.find((c) => c.Gateway && c.Gateway.includes('.'));
  if (!v4) throw new Error(`the kind network has no IPv4 gateway: ${JSON.stringify(configs)}`);
  return v4.Gateway;
}

gha.main(() => {
  const name = gha.input('name', 'kind');
  const dir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || require('os').tmpdir(), 'kind-ingress-'));
  const kind = installKind(dir);
  gha.saveState('kind', kind);
  gha.saveState('name', name);

  const config = path.join(dir, 'cluster.yaml');
  fs.writeFileSync(config, clusterConfig());
  const create = ['create', 'cluster', '--name', name, '--config', config, '--wait', '120s'];
  const image = gha.input('node-image');
  if (image) create.push('--image', image);
  gha.group('kind create cluster', () => gha.run(kind, create));

  gha.group('install the ingress controller', () => {
    const custom = gha.input('ingress-manifest');
    const manifest = path.join(dir, 'ingress.yaml');
    if (/^https?:\/\//.test(custom)) download(custom, manifest);
    else if (custom) fs.copyFileSync(custom, manifest);
    else download(INGRESS_MANIFEST, manifest, INGRESS_SHA256);
    gha.run('kubectl', ['apply', '-f', manifest]);
    const ns = gha.input('ingress-namespace', 'ingress-nginx');
    gha.run('kubectl', ['wait', '--namespace', ns, '--for=condition=ready', 'pod',
      '--selector', gha.input('ingress-selector', 'app.kubernetes.io/component=controller'), '--timeout', '180s']);
    // ingress-nginx's admission jobs patch the webhook's CA after the controller can be ready, and
    // an Ingress applied before that is refused. Another controller may have no jobs, or they may
    // already be gone, so this wait may fail.
    gha.run('kubectl', ['wait', '--namespace', ns, '--for=condition=complete', 'job', '--all', '--timeout', '120s'], { allowFail: true });
  });

  const images = gha.list('images');
  if (images.length) gha.group('kind load docker-image', () => gha.run(kind, ['load', 'docker-image', '--name', name, ...images]));

  const gw = gateway();
  gha.setOutput('gateway', gw);
  console.log(`kind-ingress: cluster ${name} is up; pods reach the runner at ${gw}`);
});
