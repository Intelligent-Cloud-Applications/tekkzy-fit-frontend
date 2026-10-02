const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminListGroupsForUserCommand,
  AdminDeleteUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const cognito = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION || process.env.AWS_REGION,
});

function poolId() {
  return String(process.env.COGNITO_USER_POOL_ID || '').trim();
}

function subOf(attributes) {
  return (attributes || []).find((a) => a.Name === 'sub')?.Value || '';
}

async function isAdminLogin(email) {
  const out = await cognito.send(new AdminListGroupsForUserCommand({ UserPoolId: poolId(), Username: email }));
  return (out.Groups || []).some((g) => ['admin', 'manager'].includes(String(g.GroupName).toLowerCase()));
}

async function findUser(email) {
  try {
    return await cognito.send(new AdminGetUserCommand({ UserPoolId: poolId(), Username: email }));
  } catch (err) {
    if (err?.name === 'UserNotFoundException') return null;
    throw err;
  }
}

function friendly(err) {
  const name = err?.name || '';
  if (name === 'InvalidPasswordException') {
    return new Error('Password must be at least 8 characters and include a lowercase letter, a number, and a symbol.');
  }
  if (name === 'InvalidParameterException') return new Error(err.message || 'Check the email and password.');
  return err;
}

/** Creates (or updates) the staff member's sign-in and returns their Cognito sub. */
async function ensureStaffLogin({ email, password, name }) {
  const username = String(email || '').trim().toLowerCase();
  if (!poolId()) throw new Error('Sign-in is not configured.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) throw new Error('A valid email is required to create a login.');
  try {
    let user = await findUser(username);
    if (user && await isAdminLogin(username)) {
      throw new Error('That email already belongs to an admin login. Use a different email for this staff member.');
    }
    if (!user) {
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: poolId(),
        Username: username,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: username },
          { Name: 'email_verified', Value: 'true' },
          ...(name ? [{ Name: 'name', Value: name }] : []),
        ],
      }));
      user = await findUser(username);
    } else if (name) {
      await cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: poolId(),
        Username: username,
        UserAttributes: [{ Name: 'name', Value: name }],
      }));
    }
    if (password) {
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: poolId(),
        Username: username,
        Password: password,
        Permanent: true,
      }));
    }
    return { email: username, sub: subOf(user?.UserAttributes) };
  } catch (err) {
    throw friendly(err);
  }
}

async function deleteStaffLogin(email) {
  const username = String(email || '').trim().toLowerCase();
  if (!username || !poolId()) return false;
  const user = await findUser(username);
  if (!user || await isAdminLogin(username)) return false;
  await cognito.send(new AdminDeleteUserCommand({ UserPoolId: poolId(), Username: username }));
  return true;
}

module.exports = { ensureStaffLogin, deleteStaffLogin };
