using System.Security.Cryptography;
using System.Text;

namespace Rasid.Server.Services;

internal static class AdminTokenComparer
{
    public static bool Matches(string? suppliedToken, string expectedToken)
    {
        if (string.IsNullOrEmpty(suppliedToken) || string.IsNullOrEmpty(expectedToken))
        {
            return false;
        }

        var suppliedHash = SHA256.HashData(Encoding.UTF8.GetBytes(suppliedToken));
        var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(expectedToken));

        return CryptographicOperations.FixedTimeEquals(suppliedHash, expectedHash);
    }
}
