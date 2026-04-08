# Auth

Fireworks++ includes a lightweight auth layer for self-hosted management APIs and enterprise gateways.

## HS256 Bearer Authentication

Use `HS256Authenticator` to validate bearer tokens signed with a shared secret.

```typescript
import { HS256Authenticator } from 'fireworks-plus-plus'

const authenticator = new HS256Authenticator({
  secret: process.env.AGENTFIREWORKS_AUTH_SECRET!,
  issuer: 'fireworks-plus-plus',
  audience: 'dashboard'
})
```

Create a token for local tools or tests:

```typescript
const token = HS256Authenticator.sign(
  {
    sub: 'alice',
    roles: ['admin'],
    iss: 'fireworks-plus-plus',
    aud: 'dashboard',
    exp: Math.floor(Date.now() / 1000) + 3600
  },
  process.env.AGENTFIREWORKS_AUTH_SECRET!
)
```

## SAML Attribute Mapping

`SAMLAttributeMapper` maps SAML-style attribute dictionaries into runtime sessions and governance actors.

```typescript
import { SAMLAttributeMapper } from 'fireworks-plus-plus'

const mapper = new SAMLAttributeMapper({
  subjectAttribute: 'email',
  roleAttribute: 'groups',
  teamAttribute: 'teams'
})

const session = mapper.map({
  email: 'alice@example.com',
  groups: ['admin', 'operator'],
  teams: ['platform']
})
```

## Scope

- This auth layer is meant for self-hosted gateways and the management server.
- It is compatible with OAuth/OIDC-style bearer token flows where your gateway issues HS256 tokens.
- It is not a full hosted SSO product.
