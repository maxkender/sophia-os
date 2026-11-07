# Remotion Lambda : mise en place sur AWS

À faire une seule fois, dans la console AWS (https://console.aws.amazon.com), environ 15 min.
Remotion 4.0.541. Les deux textes JSON ci-dessous viennent de `npx remotion lambda policies role` et
`npx remotion lambda policies user` : copie-les tels quels.

## 0. Avant de commencer

- Connecte-toi à la console AWS avec le compte de la société (ou crée-en un sur https://aws.amazon.com).
- En haut à droite, choisis la **région** où tourneront les rendus. Conseil : **Europe (Paris) `eu-west-3`**
  ou **Europe (Frankfurt) `eu-central-1`**. Note-la, tu me la donneras.
  (IAM, étapes 1 à 6, est global : la région ne compte que pour les rendus.)

## 1. Créer la politique du rôle `remotion-lambda-policy`

1. Ouvre **IAM → Policies** : https://console.aws.amazon.com/iamv2/home#/policies
2. Clique **Create policy**.
3. Choisis l'onglet **JSON**, efface ce qui s'y trouve et colle le texte **Politique du rôle** (plus bas).
4. Clique **Next**.
5. **Policy name** : `remotion-lambda-policy` (exactement ce nom). Laisse le reste.
6. Clique **Create policy**.

## 2. Créer le rôle `remotion-lambda-role`

1. Ouvre **IAM → Roles** : https://console.aws.amazon.com/iamv2/home#/roles
2. Clique **Create role**.
3. **Trusted entity type** : AWS service. **Use case** : **Lambda**. Clique **Next**.
4. Dans **Permissions policies**, cherche `remotion-lambda-policy`, coche-la, clique **Next**.
5. **Role name** : `remotion-lambda-role` (exactement ce nom). Laisse le reste.
6. Clique **Create role**.

## 3. Créer l'utilisateur `remotion-user`

1. Ouvre **IAM → Users** : https://console.aws.amazon.com/iamv2/home#/users
2. Clique **Create user** (ou **Add users**).
3. **User name** : `remotion-user`. **Ne coche pas** « Provide user access to the AWS Management Console ».
4. Clique **Next**, puis **Next** encore sans rien changer, puis **Create user**.

## 4. Donner ses droits à l'utilisateur

1. Dans **IAM → Users**, clique sur `remotion-user`.
2. Onglet **Permissions** → menu **Add permissions** → **Create inline policy**.
3. Onglet **JSON**, efface ce qui s'y trouve et colle le texte **Politique de l'utilisateur** (plus bas).
4. Clique **Next**. **Policy name** : `remotion-user-policy`.
5. Clique **Create policy**.

## 5. Créer la clé d'accès de l'utilisateur

1. Toujours sur `remotion-user`, onglet **Security credentials**, section **Access keys**.
2. Clique **Create access key**.
3. Choisis **Application running on an AWS compute service**, coche « I understand… », clique **Next**.
4. Clique **Create access key**.
5. Tu vois **Access key ID** et **Secret access key**. Le secret n'est affiché **qu'une fois** :
   garde la page ouverte pour l'étape 6 (ou télécharge le .csv et range-le dans un coffre de mots de passe).
   **Ne colle jamais ces valeurs dans le chat ni dans un fichier du dépôt.**

## 6. Mettre la clé dans l'environnement Claude Code

1. Dans une session Claude Code, ouvre le menu de l'**environnement cloud** dans la barre de titre de la
   session, puis **Edit** (ou claude.ai/code → réglages de l'environnement).
2. Dans **Environment variables**, ajoute ces trois lignes :

```
REMOTION_AWS_ACCESS_KEY_ID=<Access key ID>
REMOTION_AWS_SECRET_ACCESS_KEY=<Secret access key>
REMOTION_AWS_REGION=eu-west-3
```

   (mets ta région à la place de `eu-west-3` si tu en as choisi une autre)
3. Si le réseau de l'environnement est **limité**, ajoute aussi aux hôtes autorisés ceux de ta région, par
   exemple pour Paris : `lambda.eu-west-3.amazonaws.com`, `s3.eu-west-3.amazonaws.com`,
   `iam.amazonaws.com`, `sts.amazonaws.com`, `servicequotas.eu-west-3.amazonaws.com`
   (je te dirai s'il en manque un au premier essai).
4. Enregistre. **Les variables ne sont lues qu'au démarrage d'une session** : ouvre une nouvelle session
   (ou dis-moi de reprendre) pour la suite.

Pourquoi pas le système de clés injectées (comme ElevenLabs) : AWS signe chaque requête avec le secret,
la clé doit donc être présente dans la machine.

## 7. Ce que je fais ensuite (rien à faire de ton côté)

- `npx remotion lambda policies validate` : vérifie tes droits.
- `npx remotion lambda quotas` : vérifie combien de rendus parallèles AWS t'autorise. Un compte neuf peut être
  limité à 10 ; si c'est le cas, je prépare la demande d'augmentation (quelques jours chez AWS).
- `npx remotion lambda functions deploy` : déploie le moteur de rendu (une fois par version de Remotion).
- `npx remotion lambda sites create src/index.ts --site-name=<projet>` : envoie chaque projet (à refaire après
  chaque changement de scènes ou de voix).
- Le moteur est déjà branché : `moteur.mjs lambda --projet P` (fonction + site), puis
  `moteur.mjs rendre --projet P --langue L --lambda`. Premier essai : le Moyen Âge, pour mesurer temps et coût.

---

## Politique du rôle (étape 1, `remotion-lambda-policy`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "0",
      "Effect": "Allow",
      "Action": [
        "s3:ListAllMyBuckets"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Sid": "1",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:PutBucketAcl",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:PutObjectAcl",
        "s3:PutObject",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::remotionlambda-*"
      ]
    },
    {
      "Sid": "2",
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": [
        "arn:aws:lambda:*:*:function:remotion-render-*"
      ]
    },
    {
      "Sid": "3",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup"
      ],
      "Resource": [
        "arn:aws:logs:*:*:log-group:/aws/lambda-insights"
      ]
    },
    {
      "Sid": "4",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": [
        "arn:aws:logs:*:*:log-group:/aws/lambda/remotion-render-*",
        "arn:aws:logs:*:*:log-group:/aws/lambda-insights:*"
      ]
    }
  ]
}
```

## Politique de l'utilisateur (étape 4, `remotion-user-policy`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "HandleQuotas",
      "Effect": "Allow",
      "Action": [
        "servicequotas:GetServiceQuota",
        "servicequotas:GetAWSDefaultServiceQuota",
        "servicequotas:RequestServiceQuotaIncrease",
        "servicequotas:ListRequestedServiceQuotaChangeHistoryByQuota"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Sid": "PermissionValidation",
      "Effect": "Allow",
      "Action": [
        "iam:SimulatePrincipalPolicy"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Sid": "LambdaInvokation",
      "Effect": "Allow",
      "Action": [
        "iam:PassRole"
      ],
      "Resource": [
        "arn:aws:iam::*:role/remotion-lambda-role"
      ]
    },
    {
      "Sid": "Storage",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:PutObjectAcl",
        "s3:PutObject",
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:PutBucketAcl",
        "s3:DeleteBucket",
        "s3:PutBucketOwnershipControls",
        "s3:PutBucketPublicAccessBlock",
        "s3:PutBucketPolicy",
        "s3:PutLifecycleConfiguration"
      ],
      "Resource": [
        "arn:aws:s3:::remotionlambda-*"
      ]
    },
    {
      "Sid": "BucketListing",
      "Effect": "Allow",
      "Action": [
        "s3:ListAllMyBuckets"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Sid": "FunctionListing",
      "Effect": "Allow",
      "Action": [
        "lambda:ListFunctions",
        "lambda:GetFunction"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Sid": "FunctionManagement",
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeAsync",
        "lambda:InvokeFunction",
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:PutFunctionEventInvokeConfig",
        "lambda:PutRuntimeManagementConfig",
        "lambda:TagResource"
      ],
      "Resource": [
        "arn:aws:lambda:*:*:function:remotion-render-*"
      ]
    },
    {
      "Sid": "LogsRetention",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:PutRetentionPolicy"
      ],
      "Resource": [
        "arn:aws:logs:*:*:log-group:/aws/lambda/remotion-render-*"
      ]
    },
    {
      "Sid": "FetchBinaries",
      "Effect": "Allow",
      "Action": [
        "lambda:GetLayerVersion"
      ],
      "Resource": [
        "arn:aws:lambda:*:678892195805:layer:remotion-binaries-*",
        "arn:aws:lambda:*:580247275435:layer:LambdaInsightsExtension*"
      ]
    }
  ]
}
```
