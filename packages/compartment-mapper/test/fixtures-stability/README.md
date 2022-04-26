This fixture creates an archive with more than one instance of the same version
of the same dependency and ensures that these integrate into an archive in a
suitable deterministic order, based on the lexical sort of the dependency name
path to the package.

0. 'a (a-v1.0.0-n0)
1. 'a'a (a-v1.0.0-n1)
2. 'a'a'dep (dep-v1.0.0-n0)
3. 'a'b (b-v1.0.0) (only one version so no qualifier)
4. 'a'b'dep (dep-v1.0.0-n2)
5. 'a'dep (dep-v1.0.0-n1)
