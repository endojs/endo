export default makeModulePlugins;
declare function makeModulePlugins(options: any): {
    analyzePlugin: ({ types: t }: {
        types: any;
    }) => {
        visitor: {
            ImportDeclaration(path: any): void;
            ExportDefaultDeclaration(path: any): void;
            ClassDeclaration(path: any): void;
            FunctionDeclaration(path: any): void;
            VariableDeclaration(path: any): void;
            ExportAllDeclaration(path: any): void;
            ExportNamedDeclaration(path: any): void;
            Identifier(path: any): void;
            CallExpression(path: any): void;
        };
    } | {
        visitor: {
            MetaProperty(path: any): void;
            ImportDeclaration(path: any): void;
            ExportDefaultDeclaration(path: any): void;
            ClassDeclaration(path: any): void;
            FunctionDeclaration(path: any): void;
            VariableDeclaration(path: any): void;
            ExportAllDeclaration(path: any): void;
            ExportNamedDeclaration(path: any): void;
        };
    };
    transformPlugin: ({ types: t }: {
        types: any;
    }) => {
        visitor: {
            ImportDeclaration(path: any): void;
            ExportDefaultDeclaration(path: any): void;
            ClassDeclaration(path: any): void;
            FunctionDeclaration(path: any): void;
            VariableDeclaration(path: any): void;
            ExportAllDeclaration(path: any): void;
            ExportNamedDeclaration(path: any): void;
            Identifier(path: any): void;
            CallExpression(path: any): void;
        };
    } | {
        visitor: {
            MetaProperty(path: any): void;
            ImportDeclaration(path: any): void;
            ExportDefaultDeclaration(path: any): void;
            ClassDeclaration(path: any): void;
            FunctionDeclaration(path: any): void;
            VariableDeclaration(path: any): void;
            ExportAllDeclaration(path: any): void;
            ExportNamedDeclaration(path: any): void;
        };
    };
};
//# sourceMappingURL=babelPlugin.d.ts.map