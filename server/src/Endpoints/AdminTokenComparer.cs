using System.Buffers;
using System.Security.Cryptography;
using System.Text;

namespace Rasid.Server.Endpoints;

public static class AdminTokenComparer
{
    public static bool Matches(string? providedToken, string? expectedToken)
    {
        if (string.IsNullOrEmpty(providedToken) || string.IsNullOrEmpty(expectedToken))
        {
            return false;
        }

        Span<byte> providedHash = stackalloc byte[SHA256.HashSizeInBytes];
        Span<byte> expectedHash = stackalloc byte[SHA256.HashSizeInBytes];

        var maxProvidedBytes = Encoding.UTF8.GetMaxByteCount(providedToken.Length);
        byte[]? rentedProvided = null;
        var providedUtf8 = maxProvidedBytes <= 256
            ? stackalloc byte[maxProvidedBytes]
            : (rentedProvided = ArrayPool<byte>.Shared.Rent(maxProvidedBytes));

        var maxExpectedBytes = Encoding.UTF8.GetMaxByteCount(expectedToken.Length);
        byte[]? rentedExpected = null;
        var expectedUtf8 = maxExpectedBytes <= 256
            ? stackalloc byte[maxExpectedBytes]
            : (rentedExpected = ArrayPool<byte>.Shared.Rent(maxExpectedBytes));

        try
        {
            var pLen = Encoding.UTF8.GetBytes(providedToken, providedUtf8);
            var eLen = Encoding.UTF8.GetBytes(expectedToken, expectedUtf8);

            SHA256.HashData(providedUtf8[..pLen], providedHash);
            SHA256.HashData(expectedUtf8[..eLen], expectedHash);

            return CryptographicOperations.FixedTimeEquals(providedHash, expectedHash);
        }
        finally
        {
            if (rentedProvided is not null)
            {
                ArrayPool<byte>.Shared.Return(rentedProvided);
            }

            if (rentedExpected is not null)
            {
                ArrayPool<byte>.Shared.Return(rentedExpected);
            }
        }
    }
}
